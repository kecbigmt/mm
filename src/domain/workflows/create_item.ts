import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import {
  AliasSlug,
  CalendarDay,
  createItemIcon,
  createPermanentPlacement,
  DateTime,
  Duration,
  isCalendarDay,
  ItemId,
  itemStatusOpen,
  itemTitleFromString,
  parseAliasSlug,
  parseDateTime,
  Placement,
  PlacementRange,
  TimezoneIdentifier,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { RankService } from "../services/rank_service.ts";
import { IdGenerationService } from "../services/id_generation_service.ts";
import { AliasAutoGenerator } from "../services/alias_auto_generator.ts";
import { Alias, createAlias } from "../models/alias.ts";

export type CreateItemInput = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  project?: string;
  contexts?: readonly string[];
  alias?: string;
  parentPlacement: Placement;
  createdAt: DateTime;
  timezone: TimezoneIdentifier;
  // Scheduling fields
  startAt?: DateTime;
  duration?: Duration;
  dueAt?: CalendarDay | DateTime;
}>;

export type CreateItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  aliasAutoGenerator: AliasAutoGenerator;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type CreateItemValidationError = Readonly<{
  kind: "validation";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

export type CreateItemRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

export type DateConsistencyValidationError = Readonly<{
  kind: "date_consistency";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

export type CreateItemError = CreateItemValidationError | CreateItemRepositoryError;

export type CreateItemResult = Readonly<{
  item: Item;
  /** Aliases of topics that were auto-created for project/context references */
  createdTopics: ReadonlyArray<AliasSlug>;
}>;

const invalidInput = (
  issues: ReadonlyArray<ValidationIssue>,
): CreateItemValidationError => ({
  kind: "validation",
  message: "invalid item input",
  issues,
});

const repositoryFailure = (error: RepositoryError): CreateItemRepositoryError => ({
  kind: "repository",
  error,
});

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
  deps: CreateItemDependencies,
): Promise<Result<PreparedTopic, CreateItemError>> => {
  // Generate ID for the new topic
  const idResult = deps.idGenerationService.generateId();
  if (idResult.type === "error") {
    return Result.error(invalidInput(
      idResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["topic", "id", ...issue.path],
        })
      ),
    ));
  }
  const topicId = idResult.value;

  // Use the alias as the title
  const titleResult = itemTitleFromString(aliasSlug.toString());
  if (titleResult.type === "error") {
    return Result.error(invalidInput(
      titleResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["topic", "title", ...issue.path],
        })
      ),
    ));
  }
  const title = titleResult.value;

  // Get rank for permanent placement
  const permanentPlacement = createPermanentPlacement();
  const siblingsResult = await deps.itemRepository.listByPlacement({
    kind: "single",
    at: permanentPlacement,
  });
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
          path: ["topic", "rank", ...issue.path],
        })
      ),
    ));
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
  deps: CreateItemDependencies,
): Promise<Result<void, CreateItemError>> => {
  // Save the topic item
  const saveResult = await deps.itemRepository.save(prepared.item);
  if (saveResult.type === "error") {
    return Result.error(repositoryFailure(saveResult.error));
  }

  // Save the alias
  const aliasSaveResult = await deps.aliasRepository.save(prepared.alias);
  if (aliasSaveResult.type === "error") {
    return Result.error(repositoryFailure(aliasSaveResult.error));
  }

  return Result.ok(undefined);
};

/**
 * Extracts the date portion (YYYY-MM-DD) from a DateTime in the given timezone
 * Converts UTC datetime to local date in the workspace timezone
 */
const extractDateFromDateTime = (dateTime: DateTime, timezone: TimezoneIdentifier): string => {
  const date = dateTime.toDate();
  // Format date in the workspace timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.toString(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // Returns YYYY-MM-DD
};

/**
 * Extracts the date string from a Placement if it's a date-based placement
 * Returns null for item-based placements
 */
const extractDateFromPlacement = (placement: Placement): string | null => {
  if (placement.head.kind === "date") {
    return placement.head.date.toString();
  }
  return null;
};

/**
 * Validates that the event's startAt date matches the parent placement date
 * Only validates for calendar-based placements (date kind)
 * Skips validation for item-based placements (item kind)
 *
 * Date comparison is done in the workspace timezone to handle day boundaries correctly
 */
const validateEventDateConsistency = (
  startAt: DateTime,
  parentPlacement: Placement,
  timezone: TimezoneIdentifier,
): Result<void, DateConsistencyValidationError> => {
  const startDate = extractDateFromDateTime(startAt, timezone);
  const placementDate = extractDateFromPlacement(parentPlacement);

  // Skip validation for item-based placements
  if (placementDate === null) {
    return Result.ok(undefined);
  }

  if (startDate !== placementDate) {
    return Result.error({
      kind: "date_consistency",
      message: "event startAt date must match placement date",
      issues: [
        createValidationIssue(
          `startAt date '${startDate}' does not match placement date '${placementDate}'`,
          {
            code: "date_time_inconsistency",
            path: ["startAt"],
          },
        ),
      ],
    });
  }

  return Result.ok(undefined);
};

/**
 * Converts a CalendarDay to a DateTime at end of day (23:59:59) in the given timezone.
 * Used for deadline semantics where a date means "by the end of that day".
 */
const calendarDayToEndOfDay = (
  day: CalendarDay,
  timezone: TimezoneIdentifier,
): Result<DateTime, ValidationIssue[]> => {
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

export const CreateItemWorkflow = {
  execute: async (
    input: CreateItemInput,
    deps: CreateItemDependencies,
  ): Promise<Result<CreateItemResult, CreateItemError>> => {
    const issues: ValidationIssue[] = [];
    const createdTopics: AliasSlug[] = [];
    // Collect prepared topics during validation; persist only after all validation passes
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

    // Resolve project alias to ItemId (auto-create if not found)
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
        // Look up alias to get target ItemId
        const aliasLookup = await deps.aliasRepository.load(projectAliasResult.value);
        if (aliasLookup.type === "error") {
          issues.push(
            createValidationIssue(`Failed to look up project alias: ${aliasLookup.error.message}`, {
              code: "repository_error",
              path: ["project"],
            }),
          );
        } else if (aliasLookup.value === undefined) {
          // Build topic for non-existent project alias (deferred persistence)
          const buildResult = await buildTopicItem(
            projectAliasResult.value,
            input.createdAt,
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

    // Resolve context aliases to ItemIds (auto-create if not found)
    const contextIds: ItemId[] = [];
    // Track already processed aliases to avoid duplicate auto-creation
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
          // Check if we already processed this alias in this command
          const alreadyProcessed = processedAliases.get(aliasKey);
          if (alreadyProcessed) {
            contextIds.push(alreadyProcessed);
            continue;
          }

          // Look up alias to get target ItemId
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
                input.createdAt,
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
      // Generate automatic alias if not provided
      // Try up to 10 times to find a unique alias
      const MAX_RETRIES = 10;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const autoAliasResult = deps.aliasAutoGenerator.generate();
        if (autoAliasResult.type === "error") {
          // If generation fails, continue without alias
          break;
        }
        const candidateAlias = autoAliasResult.value;
        // Check if alias already exists
        const existingAliasResult = await deps.aliasRepository.load(candidateAlias);
        if (existingAliasResult.type === "error") {
          // If load fails, we can't verify uniqueness, so skip auto-generation
          break;
        }
        if (existingAliasResult.value === undefined) {
          // Alias is available, use it
          alias = candidateAlias;
          break;
        }
        // Alias exists, try again
      }
      // If no unique alias found after retries, continue without alias
    }

    // Validate event date consistency if event with startAt
    if (input.itemType === "event" && input.startAt) {
      const consistencyResult = validateEventDateConsistency(
        input.startAt,
        input.parentPlacement,
        input.timezone,
      );
      if (consistencyResult.type === "error") {
        issues.push(...consistencyResult.error.issues);
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

    const resolvedId = id as ItemId;
    const resolvedTitle = title!;

    // Query siblings at the parent placement
    const range: PlacementRange = { kind: "single", at: input.parentPlacement };
    const siblingsResult = await deps.itemRepository.listByPlacement(range);
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

    // Check for alias conflicts if alias is provided (manual or auto-generated)
    if (alias) {
      const existingAliasResult = await deps.aliasRepository.load(alias);
      if (existingAliasResult.type === "error") {
        return Result.error(repositoryFailure(existingAliasResult.error));
      }
      if (existingAliasResult.value) {
        // This shouldn't happen for auto-generated aliases (we check before using),
        // but can happen for manual aliases if there's a race condition
        issues.push(
          createValidationIssue(
            `alias '${alias.toString()}' already exists`,
            {
              code: "alias_conflict",
              path: ["alias"],
            },
          ),
        );
        return Result.error(invalidInput(issues));
      }
    }

    const item = createItem({
      id: resolvedId,
      title: resolvedTitle,
      icon: createItemIcon(input.itemType),
      status: itemStatusOpen(),
      placement: input.parentPlacement,
      rank: rankResult.value,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      body,
      project: projectId,
      contexts: contextIds.length > 0 ? Object.freeze(contextIds) : undefined,
      alias,
    });

    // Convert dueAt from CalendarDay to DateTime if needed
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

    // Apply schedule if any scheduling fields are provided
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

    // Persist all prepared topics now that validation has passed
    for (const prepared of pendingTopics) {
      const persistResult = await persistPreparedTopic(prepared, deps);
      if (persistResult.type === "error") {
        return Result.error(persistResult.error);
      }
    }

    const saveResult = await deps.itemRepository.save(itemWithSchedule);
    if (saveResult.type === "error") {
      return Result.error(repositoryFailure(saveResult.error));
    }

    // Save alias to alias repository if provided or auto-generated
    if (alias) {
      const aliasModel = createAlias({
        slug: alias,
        itemId: resolvedId,
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
  },
};
