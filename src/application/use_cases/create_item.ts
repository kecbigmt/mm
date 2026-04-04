import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import { Item } from "../../domain/models/item.ts";
import {
  AliasSlug,
  CalendarDay,
  createItemIcon,
  DateTime,
  Directory,
  DirectoryRange,
  Duration,
  isCalendarDay,
  ItemId,
  itemStatusOpen,
  itemTitleFromString,
  parseAliasSlug,
  parseDateTime,
  TimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { AliasAutoGenerator } from "../../domain/services/alias_auto_generator.ts";
import { IdGenerationService } from "../../domain/services/id_generation_service.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import { createAlias } from "../../domain/models/alias.ts";
import { createItem as createDomainItem } from "../../domain/models/item.ts";
import {
  buildTopicItem,
  persistPreparedTopic,
  PreparedTopic,
  TopicBuildError,
} from "../../domain/services/topic_auto_creation_service.ts";

export type CreateItemRequest = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  project?: string;
  contexts?: readonly string[];
  alias?: string;
  parentDirectory: Directory;
  createdAt: DateTime;
  timezone: TimezoneIdentifier;
  startAt?: DateTime;
  duration?: Duration;
  dueAt?: CalendarDay | DateTime;
}>;

export type CreateItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  aliasAutoGenerator: AliasAutoGenerator;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type CreatedItemDto = Readonly<{
  id: string;
  icon: string;
  title: string;
  status: string;
  rank: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  startAt?: string;
  duration?: string;
  dueAt?: string;
  snoozeUntil?: string;
  alias?: string;
  project?: string;
  contexts?: readonly string[];
  body?: string;
}>;

export type CreateItemResponse = Readonly<{
  item: CreatedItemDto;
  createdTopics: ReadonlyArray<string>;
}>;

export type CreateItemApplicationError =
  | ValidationError<"CreateItem">
  | RepositoryError;

type CreateItemValidationError = Readonly<{
  kind: "validation";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

type CreateItemRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

type CreateItemError = CreateItemValidationError | CreateItemRepositoryError;

type CreateItemResult = Readonly<{
  item: Item;
  createdTopics: ReadonlyArray<AliasSlug>;
}>;

const toDto = (item: Item): CreatedItemDto => {
  const d = item.data;
  return Object.freeze({
    id: d.id.toString(),
    icon: d.icon.toString(),
    title: d.title.toString(),
    status: d.status.isOpen() ? "open" : "closed",
    rank: d.rank.toString(),
    directory: d.directory.toString(),
    createdAt: d.createdAt.toString(),
    updatedAt: d.updatedAt.toString(),
    ...(d.closedAt ? { closedAt: d.closedAt.toString() } : {}),
    ...(d.startAt ? { startAt: d.startAt.toString() } : {}),
    ...(d.duration ? { duration: d.duration.toString() } : {}),
    ...(d.dueAt ? { dueAt: d.dueAt.toString() } : {}),
    ...(d.snoozeUntil ? { snoozeUntil: d.snoozeUntil.toString() } : {}),
    ...(d.alias ? { alias: d.alias.toString() } : {}),
    ...(d.project ? { project: d.project.toString() } : {}),
    ...(d.contexts && d.contexts.length > 0
      ? { contexts: d.contexts.map((c) => c.toString()) }
      : {}),
    ...(d.body ? { body: d.body } : {}),
  });
};

const invalidInput = (
  issues: ReadonlyArray<ValidationIssue>,
): CreateItemValidationError => ({
  kind: "validation",
  message: "invalid item input",
  issues,
});

const repositoryFailure = (
  error: RepositoryError,
): CreateItemRepositoryError => ({
  kind: "repository",
  error,
});

const topicBuildErrorToCreateItemError = (
  error: TopicBuildError,
): CreateItemError => {
  if (error.kind === "validation") {
    return invalidInput(error.issues);
  }
  return repositoryFailure(error.error);
};

const extractDateFromDateTime = (
  dateTime: DateTime,
  timezone: TimezoneIdentifier,
): string => {
  const date = dateTime.toDate();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const extractDateFromDirectory = (directory: Directory): string | null => {
  if (directory.head.kind === "date") {
    return directory.head.date.toString();
  }
  return null;
};

const validateEventDateConsistency = (
  startAt: DateTime,
  parentDirectory: Directory,
  timezone: TimezoneIdentifier,
): Result<void, ReadonlyArray<ValidationIssue>> => {
  const startDate = extractDateFromDateTime(startAt, timezone);
  const directoryDate = extractDateFromDirectory(parentDirectory);

  if (directoryDate === null) {
    return Result.ok(undefined);
  }

  if (startDate !== directoryDate) {
    return Result.error([
      createValidationIssue(
        `startAt date '${startDate}' does not match directory date '${directoryDate}'`,
        {
          code: "date_time_inconsistency",
          path: ["startAt"],
        },
      ),
    ]);
  }

  return Result.ok(undefined);
};

const calendarDayToEndOfDay = (
  day: CalendarDay,
  timezone: TimezoneIdentifier,
): Result<DateTime, ReadonlyArray<ValidationIssue>> => {
  const endOfDayStr = `${day.toString()}T23:59:59`;
  const result = parseDateTime(endOfDayStr, { timezone });
  if (result.type === "error") {
    return Result.error(
      result.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["dueAt", ...issue.path],
        })
      ),
    );
  }
  return Result.ok(result.value);
};

const executeCreateItem = async (
  input: CreateItemRequest,
  deps: CreateItemDeps,
): Promise<Result<CreateItemResult, CreateItemError>> => {
  const issues: ValidationIssue[] = [];
  const createdTopics: AliasSlug[] = [];
  const pendingTopics: PreparedTopic[] = [];

  const titleResult = itemTitleFromString(input.title);
  const title = titleResult.type === "ok" ? titleResult.value : undefined;
  if (titleResult.type === "error") {
    issues.push(
      ...titleResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["title", ...issue.path],
        })
      ),
    );
  }

  let projectId: ItemId | undefined;
  if (typeof input.project === "string") {
    const projectAliasResult = parseAliasSlug(input.project);
    if (projectAliasResult.type === "error") {
      issues.push(
        ...projectAliasResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["project", ...issue.path],
          })
        ),
      );
    } else {
      const aliasLookup = await deps.aliasRepository.load(projectAliasResult.value);
      if (aliasLookup.type === "error") {
        issues.push(
          createValidationIssue(
            `Failed to look up project alias: ${aliasLookup.error.message}`,
            {
              code: "repository_error",
              path: ["project"],
            },
          ),
        );
      } else if (aliasLookup.value === undefined) {
        const buildResult = await buildTopicItem(
          projectAliasResult.value,
          input.createdAt,
          deps,
        );
        if (buildResult.type === "error") {
          return Result.error(topicBuildErrorToCreateItemError(buildResult.error));
        }
        projectId = buildResult.value.item.data.id;
        pendingTopics.push(buildResult.value);
        createdTopics.push(projectAliasResult.value);
      } else {
        projectId = aliasLookup.value.data.itemId;
      }
    }
  }

  const contextIds: ItemId[] = [];
  const processedAliases = new Map<string, ItemId>();
  if (input.contexts && input.contexts.length > 0) {
    for (const [index, contextStr] of input.contexts.entries()) {
      const contextAliasResult = parseAliasSlug(contextStr);
      if (contextAliasResult.type === "error") {
        issues.push(
          ...contextAliasResult.error.issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: issue.code,
              path: ["contexts", index, ...issue.path],
            })
          ),
        );
      } else {
        const aliasKey = contextAliasResult.value.toString();
        const alreadyProcessed = processedAliases.get(aliasKey);
        if (alreadyProcessed) {
          contextIds.push(alreadyProcessed);
          continue;
        }

        const aliasLookup = await deps.aliasRepository.load(contextAliasResult.value);
        if (aliasLookup.type === "error") {
          issues.push(
            createValidationIssue(
              `Failed to look up context alias: ${aliasLookup.error.message}`,
              {
                code: "repository_error",
                path: ["contexts", index],
              },
            ),
          );
        } else if (aliasLookup.value === undefined) {
          const alreadyPrepared = pendingTopics.find((t) => t.slug.toString() === aliasKey);
          if (alreadyPrepared) {
            const itemId = alreadyPrepared.item.data.id;
            contextIds.push(itemId);
            processedAliases.set(aliasKey, itemId);
          } else {
            const buildResult = await buildTopicItem(
              contextAliasResult.value,
              input.createdAt,
              deps,
            );
            if (buildResult.type === "error") {
              return Result.error(topicBuildErrorToCreateItemError(buildResult.error));
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

  let alias: AliasSlug | undefined;
  if (typeof input.alias === "string") {
    const aliasResult = parseAliasSlug(input.alias);
    if (aliasResult.type === "error") {
      issues.push(
        ...aliasResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["alias", ...issue.path],
          })
        ),
      );
    } else {
      alias = aliasResult.value;
    }
  } else {
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const autoAliasResult = deps.aliasAutoGenerator.generate();
      if (autoAliasResult.type === "error") {
        break;
      }
      const candidateAlias = autoAliasResult.value;
      const existingAliasResult = await deps.aliasRepository.load(candidateAlias);
      if (existingAliasResult.type === "error") {
        break;
      }
      if (existingAliasResult.value === undefined) {
        alias = candidateAlias;
        break;
      }
    }
  }

  if (input.itemType === "event" && input.startAt) {
    const consistencyResult = validateEventDateConsistency(
      input.startAt,
      input.parentDirectory,
      input.timezone,
    );
    if (consistencyResult.type === "error") {
      issues.push(...consistencyResult.error);
    }
  }

  const idResult = deps.idGenerationService.generateId();
  const id = idResult.type === "ok" ? idResult.value : undefined;
  if (idResult.type === "error") {
    issues.push(
      ...idResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["id", ...issue.path],
        })
      ),
    );
  }

  if (issues.length > 0) {
    return Result.error(invalidInput(issues));
  }

  const range: DirectoryRange = { kind: "single", at: input.parentDirectory };
  const siblingsResult = await deps.itemRepository.listByDirectory(range);
  if (siblingsResult.type === "error") {
    return Result.error(repositoryFailure(siblingsResult.error));
  }

  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);
  if (rankResult.type === "error") {
    return Result.error(invalidInput(
      rankResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["rank", ...issue.path],
        })
      ),
    ));
  }

  const trimmedBody = typeof input.body === "string" ? input.body.trim() : undefined;
  const body = trimmedBody && trimmedBody.length > 0 ? trimmedBody : undefined;

  if (alias) {
    const existingAliasResult = await deps.aliasRepository.load(alias);
    if (existingAliasResult.type === "error") {
      return Result.error(repositoryFailure(existingAliasResult.error));
    }
    if (existingAliasResult.value) {
      return Result.error(invalidInput([
        createValidationIssue(
          `alias '${alias.toString()}' already exists`,
          {
            code: "alias_conflict",
            path: ["alias"],
          },
        ),
      ]));
    }
  }

  const item = createDomainItem({
    id: id as ItemId,
    title: title!,
    icon: createItemIcon(input.itemType),
    status: itemStatusOpen(),
    directory: input.parentDirectory,
    rank: rankResult.value,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    body,
    project: projectId,
    contexts: contextIds.length > 0 ? Object.freeze(contextIds) : undefined,
    alias,
  });

  let resolvedDueAt: DateTime | undefined;
  if (input.dueAt) {
    if (isCalendarDay(input.dueAt)) {
      const conversionResult = calendarDayToEndOfDay(input.dueAt, input.timezone);
      if (conversionResult.type === "error") {
        return Result.error(invalidInput(conversionResult.error));
      }
      resolvedDueAt = conversionResult.value;
    } else {
      resolvedDueAt = input.dueAt;
    }
  }

  let itemWithSchedule = item;
  if (input.startAt || input.duration || resolvedDueAt) {
    itemWithSchedule = item.schedule(
      {
        startAt: input.startAt,
        duration: input.duration,
        dueAt: resolvedDueAt,
      },
      input.createdAt,
    );
  }

  for (const prepared of pendingTopics) {
    const persistResult = await persistPreparedTopic(prepared, deps);
    if (persistResult.type === "error") {
      return Result.error(repositoryFailure(persistResult.error));
    }
  }

  const saveResult = await deps.itemRepository.save(itemWithSchedule);
  if (saveResult.type === "error") {
    return Result.error(repositoryFailure(saveResult.error));
  }

  if (alias) {
    const aliasModel = createAlias({
      slug: alias,
      itemId: id as ItemId,
      createdAt: input.createdAt,
    });
    const aliasSaveResult = await deps.aliasRepository.save(aliasModel);
    if (aliasSaveResult.type === "error") {
      return Result.error(repositoryFailure(aliasSaveResult.error));
    }
  }

  return Result.ok({
    item: itemWithSchedule,
    createdTopics: Object.freeze(createdTopics),
  });
};

const mapCreateItemError = (
  error: CreateItemError,
): CreateItemApplicationError => {
  if (error.kind === "repository") {
    return error.error;
  }
  return createValidationError(
    "CreateItem",
    error.issues,
    { message: error.message },
  );
};

export const createItem = async (
  request: CreateItemRequest,
  deps: CreateItemDeps,
): Promise<Result<CreateItemResponse, CreateItemApplicationError>> => {
  const result = await executeCreateItem(request, deps);

  if (result.type === "error") {
    return Result.error(mapCreateItemError(result.error));
  }

  return Result.ok(
    Object.freeze({
      item: toDto(result.value.item),
      createdTopics: Object.freeze(
        result.value.createdTopics.map((topic) => topic.toString()),
      ),
    }),
  );
};
