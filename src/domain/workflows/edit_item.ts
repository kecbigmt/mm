import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import { Alias, createAlias } from "../models/alias.ts";
import {
  AliasSlug,
  createItemIcon,
  createPermanentPlacement,
  DateTime,
  Duration,
  ItemId,
  itemStatusOpen,
  itemTitleFromString,
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemId,
  parseItemTitle,
  TimezoneIdentifier,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { RankService } from "../services/rank_service.ts";
import { IdGenerationService } from "../services/id_generation_service.ts";

export type EditItemInput = Readonly<{
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

export type EditItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type EditItemValidationError = ValidationError<"EditItem">;

export type EditItemError =
  | EditItemValidationError
  | RepositoryError;

export type EditItemResult = Readonly<{
  item: Item;
  /** Aliases of topics that were auto-created for project/context references */
  createdTopics: ReadonlyArray<AliasSlug>;
}>;

/**
 * A prepared topic ready to be persisted. Contains the Item and Alias that
 * will be saved together when the main workflow validation passes.
 */
type PreparedTopic = Readonly<{
  item: Item;
  alias: Alias;
  slug: AliasSlug;
}>;

/**
 * Builds a topic item and alias without persisting them.
 * Used to defer persistence until after all validation passes.
 */
const buildTopicItem = async (
  aliasSlug: AliasSlug,
  createdAt: DateTime,
  deps: EditItemDependencies,
): Promise<Result<PreparedTopic, EditItemError>> => {
  // Generate ID for the new topic
  const idResult = deps.idGenerationService.generateId();
  if (idResult.type === "error") {
    return Result.error(
      createValidationError(
        "EditItem",
        idResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["topic", "id", ...issue.path],
          })
        ),
      ),
    );
  }
  const topicId = idResult.value;

  // Use the alias as the title
  const titleResult = itemTitleFromString(aliasSlug.toString());
  if (titleResult.type === "error") {
    return Result.error(
      createValidationError(
        "EditItem",
        titleResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["topic", "title", ...issue.path],
          })
        ),
      ),
    );
  }
  const title = titleResult.value;

  // Get rank for permanent placement
  const permanentPlacement = createPermanentPlacement();
  const siblingsResult = await deps.itemRepository.listByPlacement({
    kind: "single",
    at: permanentPlacement,
  });
  if (siblingsResult.type === "error") {
    return Result.error(siblingsResult.error);
  }
  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);
  if (rankResult.type === "error") {
    return Result.error(
      createValidationError(
        "EditItem",
        rankResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["topic", "rank", ...issue.path],
          })
        ),
      ),
    );
  }

  // Create the topic item (not persisted yet)
  const topicItem = createItem({
    id: topicId,
    title,
    icon: createItemIcon("topic"),
    status: itemStatusOpen(),
    placement: permanentPlacement,
    rank: rankResult.value,
    createdAt,
    updatedAt: createdAt,
    alias: aliasSlug,
  });

  // Create the alias model (not persisted yet)
  const aliasModel = createAlias({
    slug: aliasSlug,
    itemId: topicId,
    createdAt,
  });

  return Result.ok({
    item: topicItem,
    alias: aliasModel,
    slug: aliasSlug,
  });
};

/**
 * Persists a prepared topic (item and alias) to the repositories.
 */
const persistPreparedTopic = async (
  prepared: PreparedTopic,
  deps: EditItemDependencies,
): Promise<Result<void, EditItemError>> => {
  // Save the topic item
  const saveResult = await deps.itemRepository.save(prepared.item);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  // Save the alias
  const aliasSaveResult = await deps.aliasRepository.save(prepared.alias);
  if (aliasSaveResult.type === "error") {
    return Result.error(aliasSaveResult.error);
  }

  return Result.ok(undefined);
};

export const EditItemWorkflow = {
  execute: async (
    input: EditItemInput,
    deps: EditItemDependencies,
  ): Promise<Result<EditItemResult, EditItemError>> => {
    const createdTopics: AliasSlug[] = [];
    // Collect prepared topics during validation; persist only after all validation passes
    const pendingTopics: PreparedTopic[] = [];
    let item: Item | undefined;
    const uuidResult = parseItemId(input.itemLocator);

    if (uuidResult.type === "ok") {
      const loadResult = await deps.itemRepository.load(uuidResult.value);
      if (loadResult.type === "error") {
        return Result.error(loadResult.error);
      }
      item = loadResult.value;
    } else {
      const aliasResult = parseAliasSlug(input.itemLocator);
      if (aliasResult.type === "ok") {
        const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
        if (aliasLoadResult.type === "error") {
          return Result.error(aliasLoadResult.error);
        }
        const alias = aliasLoadResult.value;
        if (alias) {
          const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
          if (itemLoadResult.type === "error") {
            return Result.error(itemLoadResult.error);
          }
          item = itemLoadResult.value;
        }
      }
    }

    if (!item) {
      return Result.error(
        createValidationError("EditItem", [
          createValidationIssue(`Item not found: ${input.itemLocator}`, {
            code: "not_found",
            path: ["itemLocator"],
          }),
        ]),
      );
    }

    let updatedItem = item;
    const issues: Array<{ field: string; message: string }> = [];

    // Track alias changes for index updates
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
      if (issues.length === 0 || !issues.some((i) => i.field === "alias")) {
        const oldAliasStr = oldAlias?.toString();
        const newAliasStr = aliasValue?.toString();
        if (oldAliasStr !== newAliasStr) {
          aliasChanged = true;
          newAlias = aliasValue;
        }
        updatedItem = updatedItem.setAlias(aliasValue, input.updatedAt);
      }
    }

    // Resolve project alias to ItemId (auto-create if not found)
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
          // Look up alias to get target ItemId
          const aliasLookup = await deps.aliasRepository.load(projectAliasResult.value);
          if (aliasLookup.type === "error") {
            issues.push({
              field: "project",
              message: `Failed to look up project alias: ${aliasLookup.error.message}`,
            });
          } else if (aliasLookup.value === undefined) {
            // Build topic for non-existent project alias (deferred persistence)
            const buildResult = await buildTopicItem(
              projectAliasResult.value,
              input.updatedAt,
              deps,
            );
            if (buildResult.type === "error") {
              return Result.error(buildResult.error);
            }
            projectId = buildResult.value.item.data.id;
            pendingTopics.push(buildResult.value);
            createdTopics.push(projectAliasResult.value);
          } else {
            projectId = aliasLookup.value.data.itemId;
          }
        }
      }
      if (issues.length === 0 || !issues.some((i) => i.field === "project")) {
        updatedItem = updatedItem.setProject(projectId, input.updatedAt);
      }
    }

    // Resolve context aliases to ItemIds (auto-create if not found)
    if (input.updates.contexts !== undefined) {
      const contextIds: ItemId[] = [];
      // Track already processed aliases to avoid duplicate auto-creation
      const processedAliases = new Map<string, ItemId>();
      let hasContextErrors = false;
      for (const [index, contextStr] of input.updates.contexts.entries()) {
        if (contextStr.trim().length > 0) {
          const contextAliasResult = parseAliasSlug(contextStr);
          if (contextAliasResult.type === "error") {
            issues.push({
              field: `contexts[${index}]`,
              message: contextAliasResult.error.issues[0]?.message ??
                "Invalid context alias format",
            });
            hasContextErrors = true;
          } else {
            const aliasKey = contextAliasResult.value.toString();
            // Check if we already processed this alias in this command
            const alreadyProcessed = processedAliases.get(aliasKey);
            if (alreadyProcessed) {
              contextIds.push(alreadyProcessed);
              continue;
            }

            // Look up alias to get target ItemId
            const aliasLookup = await deps.aliasRepository.load(contextAliasResult.value);
            if (aliasLookup.type === "error") {
              issues.push({
                field: `contexts[${index}]`,
                message: `Failed to look up context alias: ${aliasLookup.error.message}`,
              });
              hasContextErrors = true;
            } else if (aliasLookup.value === undefined) {
              // Check if this topic was already prepared (e.g., same alias used for project)
              const alreadyPrepared = pendingTopics.find((t) => t.slug.toString() === aliasKey);
              if (alreadyPrepared) {
                const itemId = alreadyPrepared.item.data.id;
                contextIds.push(itemId);
                processedAliases.set(aliasKey, itemId);
              } else {
                // Build topic for non-existent context alias (deferred persistence)
                const buildResult = await buildTopicItem(
                  contextAliasResult.value,
                  input.updatedAt,
                  deps,
                );
                if (buildResult.type === "error") {
                  return Result.error(buildResult.error);
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
      // Preserve existing values by default
      startAt: updatedItem.data.startAt,
      duration: updatedItem.data.duration,
      dueAt: updatedItem.data.dueAt,
    };
    let hasScheduleUpdates = false;

    // Extract reference date from item placement for time-only formats
    // Use a neutral time (noon UTC) to avoid day shifts when formatting in workspace timezone
    let referenceDate = input.updatedAt.toDate();
    if (updatedItem.data.placement.head.kind === "date") {
      const dateStr = updatedItem.data.placement.head.date.toString();
      const [year, month, day] = dateStr.split("-").map(Number);
      // Use noon UTC to ensure the date remains stable when formatted in any timezone
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
          message: startAtResult.error.issues[0]?.message ?? "Invalid start time",
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
          message: dueAtResult.error.issues[0]?.message ?? "Invalid due date",
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

    // Check for alias collision before updating
    if (aliasChanged && newAlias) {
      const existingAliasResult = await deps.aliasRepository.load(newAlias);
      if (existingAliasResult.type === "error") {
        return Result.error(existingAliasResult.error);
      }
      if (existingAliasResult.value) {
        // Alias exists and points to a different item
        if (!existingAliasResult.value.data.itemId.equals(item.data.id)) {
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
    }

    // Persist all prepared topics now that validation has passed
    for (const prepared of pendingTopics) {
      const persistResult = await persistPreparedTopic(prepared, deps);
      if (persistResult.type === "error") {
        return Result.error(persistResult.error);
      }
    }

    // Save item first to ensure it succeeds before updating indexes
    const saveResult = await deps.itemRepository.save(updatedItem);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    // Update alias index after successful item save
    if (aliasChanged) {
      // Delete old alias if it exists
      if (oldAlias) {
        const deleteResult = await deps.aliasRepository.delete(oldAlias);
        if (deleteResult.type === "error") {
          return Result.error(deleteResult.error);
        }
      }

      // Save new alias if it exists
      if (newAlias) {
        const aliasModel = createAlias({
          slug: newAlias,
          itemId: item.data.id,
          createdAt: input.updatedAt,
        });
        const aliasSaveResult = await deps.aliasRepository.save(aliasModel);
        if (aliasSaveResult.type === "error") {
          return Result.error(aliasSaveResult.error);
        }
      }
    }

    return Result.ok({
      item: updatedItem,
      createdTopics: Object.freeze(createdTopics),
    });
  },
};
