import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createAlias } from "../../domain/models/alias.ts";
import { Item } from "../../domain/models/item.ts";
import {
  AliasSlug,
  DateTime,
  Duration,
  ItemId,
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemTitle,
  TimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createItemLocatorService } from "../../domain/services/item_locator_service.ts";
import { IdGenerationService } from "../../domain/services/id_generation_service.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import {
  buildTopicItem,
  persistPreparedTopic,
  PreparedTopic,
  TopicBuildError,
} from "../../domain/services/topic_auto_creation_service.ts";
import { ItemDto, toItemDto } from "./item_dto.ts";

export type EditItemRequest = Readonly<{
  itemLocator: string;
  updates: Readonly<{
    title?: string;
    icon?: string;
    body?: string;
    startAt?: string;
    duration?: string;
    dueAt?: string;
    alias?: string;
    project?: string;
    contexts?: readonly string[];
  }>;
  updatedAt: DateTime;
  timezone: TimezoneIdentifier;
}>;

export type EditItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  idGenerationService: IdGenerationService;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

export type EditItemApplicationError = ValidationError<"EditItem"> | RepositoryError;

export type EditItemResponse = Readonly<{
  item: ItemDto;
  createdTopics: ReadonlyArray<string>;
}>;

type EditItemDomainResponse = Readonly<{
  item: Item;
  createdTopics: ReadonlyArray<AliasSlug>;
}>;

const topicBuildErrorToEditItemError = (
  error: TopicBuildError,
): EditItemApplicationError => {
  if (error.kind === "validation") {
    return createValidationError("EditItem", error.issues);
  }
  return error.error;
};

export const editItemForDomain = async (
  input: EditItemRequest,
  deps: EditItemDeps,
): Promise<Result<EditItemDomainResponse, EditItemApplicationError>> => {
  const createdTopics: AliasSlug[] = [];
  const pendingTopics: PreparedTopic[] = [];

  const locatorService = createItemLocatorService({
    itemRepository: deps.itemRepository,
    aliasRepository: deps.aliasRepository,
    timezone: input.timezone,
    prefixCandidates: deps.prefixCandidates,
  });
  const resolveResult = await locatorService.resolve(input.itemLocator);

  if (resolveResult.type === "error") {
    const locatorError = resolveResult.error;
    if (locatorError.kind === "repository_error") {
      return Result.error(locatorError.error);
    }
    if (locatorError.kind === "ambiguous_prefix") {
      return Result.error(
        createValidationError("EditItem", [
          createValidationIssue(
            `Ambiguous prefix '${locatorError.locator}': matches ${
              locatorError.candidates.join(", ")
            }`,
            { code: "ambiguous_prefix", path: ["itemLocator"] },
          ),
        ]),
      );
    }
    return Result.error(
      createValidationError("EditItem", [
        createValidationIssue(`Item not found: ${input.itemLocator}`, {
          code: "not_found",
          path: ["itemLocator"],
        }),
      ]),
    );
  }

  const item = resolveResult.value;
  let updatedItem = item;
  const issues: Array<{ field: string; message: string }> = [];

  const oldAlias = item.data.alias;
  let newAlias: AliasSlug | undefined = oldAlias;
  let aliasChanged = false;

  if (input.updates.title !== undefined) {
    const titleResult = parseItemTitle(input.updates.title);
    if (titleResult.type === "error") {
      issues.push({
        field: "title",
        message: titleResult.error.issues[0]?.message ?? "Invalid title",
      });
    } else {
      updatedItem = updatedItem.retitle(titleResult.value, input.updatedAt);
    }
  }

  if (input.updates.icon !== undefined) {
    const iconResult = parseItemIcon(input.updates.icon);
    if (iconResult.type === "error") {
      issues.push({
        field: "icon",
        message: iconResult.error.issues[0]?.message ?? "Invalid icon",
      });
    } else {
      updatedItem = updatedItem.changeIcon(iconResult.value, input.updatedAt);
    }
  }

  if (input.updates.body !== undefined) {
    updatedItem = updatedItem.setBody(input.updates.body, input.updatedAt);
  }

  if (input.updates.alias !== undefined) {
    let aliasValue: AliasSlug | undefined;
    if (input.updates.alias.trim().length > 0) {
      const aliasResult = parseAliasSlug(input.updates.alias);
      if (aliasResult.type === "error") {
        issues.push({
          field: "alias",
          message: aliasResult.error.issues[0]?.message ?? "Invalid alias",
        });
      } else {
        aliasValue = aliasResult.value;
      }
    }
    if (issues.length === 0 || !issues.some((issue) => issue.field === "alias")) {
      const oldAliasStr = oldAlias?.toString();
      const newAliasStr = aliasValue?.toString();
      if (oldAliasStr !== newAliasStr) {
        aliasChanged = true;
        newAlias = aliasValue;
      }
      updatedItem = updatedItem.setAlias(aliasValue, input.updatedAt);
    }
  }

  if (input.updates.project !== undefined) {
    let projectId: ItemId | undefined;
    if (input.updates.project.trim().length > 0) {
      const projectAliasResult = parseAliasSlug(input.updates.project);
      if (projectAliasResult.type === "error") {
        issues.push({
          field: "project",
          message: projectAliasResult.error.issues[0]?.message ?? "Invalid project alias format",
        });
      } else {
        const aliasLookup = await deps.aliasRepository.load(projectAliasResult.value);
        if (aliasLookup.type === "error") {
          issues.push({
            field: "project",
            message: `Failed to look up project alias: ${aliasLookup.error.message}`,
          });
        } else if (aliasLookup.value === undefined) {
          const buildResult = await buildTopicItem(projectAliasResult.value, input.updatedAt, deps);
          if (buildResult.type === "error") {
            return Result.error(topicBuildErrorToEditItemError(buildResult.error));
          }
          projectId = buildResult.value.item.data.id;
          pendingTopics.push(buildResult.value);
          createdTopics.push(projectAliasResult.value);
        } else {
          projectId = aliasLookup.value.data.itemId;
        }
      }
    }
    if (issues.length === 0 || !issues.some((issue) => issue.field === "project")) {
      updatedItem = updatedItem.setProject(projectId, input.updatedAt);
    }
  }

  if (input.updates.contexts !== undefined) {
    const contextIds: ItemId[] = [];
    const processedAliases = new Map<string, ItemId>();
    let hasContextErrors = false;

    for (const [index, contextStr] of input.updates.contexts.entries()) {
      if (contextStr.trim().length === 0) {
        continue;
      }
      const contextAliasResult = parseAliasSlug(contextStr);
      if (contextAliasResult.type === "error") {
        issues.push({
          field: `contexts[${index}]`,
          message: contextAliasResult.error.issues[0]?.message ?? "Invalid context alias format",
        });
        hasContextErrors = true;
        continue;
      }

      const aliasKey = contextAliasResult.value.toString();
      const alreadyProcessed = processedAliases.get(aliasKey);
      if (alreadyProcessed) {
        contextIds.push(alreadyProcessed);
        continue;
      }

      const aliasLookup = await deps.aliasRepository.load(contextAliasResult.value);
      if (aliasLookup.type === "error") {
        issues.push({
          field: `contexts[${index}]`,
          message: `Failed to look up context alias: ${aliasLookup.error.message}`,
        });
        hasContextErrors = true;
      } else if (aliasLookup.value === undefined) {
        const alreadyPrepared = pendingTopics.find((topic) => topic.slug.toString() === aliasKey);
        if (alreadyPrepared) {
          const itemId = alreadyPrepared.item.data.id;
          contextIds.push(itemId);
          processedAliases.set(aliasKey, itemId);
        } else {
          const buildResult = await buildTopicItem(contextAliasResult.value, input.updatedAt, deps);
          if (buildResult.type === "error") {
            return Result.error(topicBuildErrorToEditItemError(buildResult.error));
          }
          contextIds.push(buildResult.value.item.data.id);
          processedAliases.set(aliasKey, buildResult.value.item.data.id);
          pendingTopics.push(buildResult.value);
          createdTopics.push(contextAliasResult.value);
        }
      } else {
        const itemId = aliasLookup.value.data.itemId;
        contextIds.push(itemId);
        processedAliases.set(aliasKey, itemId);
      }
    }

    if (!hasContextErrors) {
      updatedItem = updatedItem.setContexts(
        contextIds.length > 0 ? Object.freeze(contextIds) : undefined,
        input.updatedAt,
      );
    }
  }

  const scheduleUpdates: {
    startAt?: DateTime;
    duration?: Duration;
    dueAt?: DateTime;
  } = {
    startAt: updatedItem.data.startAt,
    duration: updatedItem.data.duration,
    dueAt: updatedItem.data.dueAt,
  };
  let hasScheduleUpdates = false;

  let referenceDate = input.updatedAt.toDate();
  if (updatedItem.data.directory.head.kind === "date") {
    const dateStr = updatedItem.data.directory.head.date.toString();
    const [year, month, day] = dateStr.split("-").map(Number);
    referenceDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }

  if (input.updates.startAt !== undefined) {
    const startAtResult = parseDateTime(input.updates.startAt, {
      referenceDate,
      timezone: input.timezone,
    });
    if (startAtResult.type === "error") {
      issues.push({
        field: "startAt",
        message: startAtResult.error.issues[0]?.message ?? "Invalid startAt",
      });
    } else {
      scheduleUpdates.startAt = startAtResult.value;
      hasScheduleUpdates = true;
    }
  }

  if (input.updates.duration !== undefined) {
    const durationResult = parseDuration(input.updates.duration);
    if (durationResult.type === "error") {
      issues.push({
        field: "duration",
        message: durationResult.error.issues[0]?.message ?? "Invalid duration",
      });
    } else {
      scheduleUpdates.duration = durationResult.value;
      hasScheduleUpdates = true;
    }
  }

  if (input.updates.dueAt !== undefined) {
    const dueAtResult = parseDateTime(input.updates.dueAt, {
      referenceDate,
      timezone: input.timezone,
    });
    if (dueAtResult.type === "error") {
      issues.push({
        field: "dueAt",
        message: dueAtResult.error.issues[0]?.message ?? "Invalid dueAt",
      });
    } else {
      scheduleUpdates.dueAt = dueAtResult.value;
      hasScheduleUpdates = true;
    }
  }

  if (hasScheduleUpdates && issues.length === 0) {
    updatedItem = updatedItem.schedule(scheduleUpdates, input.updatedAt);
  }

  if (issues.length > 0) {
    return Result.error(
      createValidationError(
        "EditItem",
        issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: "invalid_value",
            path: [issue.field],
          })
        ),
      ),
    );
  }

  if (aliasChanged && newAlias) {
    const existingAliasResult = await deps.aliasRepository.load(newAlias);
    if (existingAliasResult.type === "error") {
      return Result.error(existingAliasResult.error);
    }
    if (existingAliasResult.value && !existingAliasResult.value.data.itemId.equals(item.data.id)) {
      return Result.error(
        createValidationError("EditItem", [
          createValidationIssue(
            `Alias '${newAlias.toString()}' is already in use by another item`,
            {
              code: "conflict",
              path: ["alias"],
            },
          ),
        ]),
      );
    }
  }

  for (const topic of pendingTopics) {
    const persistResult = await persistPreparedTopic(topic, deps);
    if (persistResult.type === "error") {
      return Result.error(persistResult.error);
    }
  }

  const saveResult = await deps.itemRepository.save(updatedItem);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  if (aliasChanged) {
    if (oldAlias) {
      const deleteResult = await deps.aliasRepository.delete(oldAlias);
      if (deleteResult.type === "error") {
        return Result.error(deleteResult.error);
      }
    }
    if (newAlias) {
      const alias = createAlias({
        slug: newAlias,
        itemId: updatedItem.data.id,
        createdAt: input.updatedAt,
      });
      const aliasSaveResult = await deps.aliasRepository.save(alias);
      if (aliasSaveResult.type === "error") {
        return Result.error(aliasSaveResult.error);
      }
    }
  }

  return Result.ok({
    item: updatedItem,
    createdTopics: Object.freeze(createdTopics),
  });
};

export const editItem = async (
  input: EditItemRequest,
  deps: EditItemDeps,
): Promise<Result<EditItemResponse, EditItemApplicationError>> => {
  const result = await editItemForDomain(input, deps);
  if (result.type === "error") {
    return result;
  }

  return Result.ok(
    Object.freeze({
      item: toItemDto(result.value.item),
      createdTopics: Object.freeze(result.value.createdTopics.map((topic) => topic.toString())),
    }),
  );
};
