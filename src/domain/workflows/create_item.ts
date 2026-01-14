import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import {
  AliasSlug,
  CalendarDay,
  createItemIcon,
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
import { createAlias } from "../models/alias.ts";

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

    // Resolve project alias to ItemId
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
          issues.push(
            createValidationIssue(`Alias '${input.project}' not found`, {
              code: "alias_not_found",
              path: ["project"],
            }),
          );
        } else {
          projectId = aliasLookup.value.data.itemId;
        }
      }
    }

    // Resolve context aliases to ItemIds
    const contextIds: ItemId[] = [];
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
            issues.push(
              createValidationIssue(`Alias '${contextStr}' not found`, {
                code: "alias_not_found",
                path: ["contexts", index],
              }),
            );
          } else {
            contextIds.push(aliasLookup.value.data.itemId);
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

    return Result.ok({ item: itemWithSchedule });
  },
};
