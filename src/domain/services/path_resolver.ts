import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { PathExpression, PathToken, RangeExpression } from "../primitives/path_types.ts";
import {
  createDatePlacement,
  createDateRange,
  createItemPlacement,
  createNumericRange,
  createPermanentPlacement,
  createPlacement,
  createSingleRange,
  parseAliasSlug,
  parseCalendarDay,
  parseItemId,
  Placement,
  PlacementRange,
  TimezoneIdentifier,
} from "../primitives/mod.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import {
  isPeriodKeyword,
  resolvePeriodRange,
  resolveRelativeDate as resolveDateExpression,
} from "./date_resolver.ts";
import { resolvePrefix } from "./alias_prefix_service.ts";

const PATH_RESOLVER_ERROR_KIND = "PathResolver" as const;

export type PathResolverError = ValidationError<typeof PATH_RESOLVER_ERROR_KIND>;

/**
 * PathResolver converts CLI path expressions to canonical Placements
 *
 * Responsibilities:
 * - Resolve relative date tokens (today, +2w, ~mon) to absolute dates
 * - Resolve aliases to UUIDs
 * - Resolve relative navigation (., ..) based on CWD
 * - Convert RangeExpression to PlacementRange
 */
export interface PathResolver {
  /**
   * Resolve a PathExpression to a canonical Placement
   */
  resolvePath(
    cwd: Placement,
    expr: PathExpression,
  ): Promise<Result<Placement, PathResolverError>>;

  /**
   * Resolve a RangeExpression to a canonical PlacementRange
   */
  resolveRange(
    cwd: Placement,
    expr: RangeExpression,
  ): Promise<Result<PlacementRange, PathResolverError>>;
}

export type PathResolverDependencies = Readonly<{
  readonly aliasRepository: AliasRepository;
  readonly itemRepository: ItemRepository;
  readonly timezone: TimezoneIdentifier;
  readonly today?: Date; // For testing; defaults to new Date()
}>;

/** Try prefix resolution against all known aliases */
const resolveAliasByPrefix = async (
  token: string,
  aliasRepository: AliasRepository,
): Promise<Result<Placement, PathResolverError>> => {
  const listResult = await aliasRepository.list();
  if (listResult.type === "error") {
    return Result.error(
      createValidationError(PATH_RESOLVER_ERROR_KIND, [
        createValidationIssue(
          `failed to list aliases for prefix resolution: ${listResult.error.message}`,
          { code: "alias_resolution_failed", path: [] },
        ),
      ]),
    );
  }

  const allAliases = listResult.value;
  const allAliasStrings = allAliases.map((a) => a.data.slug.toString());
  const prefixResult = resolvePrefix(token, [], allAliasStrings);

  if (prefixResult.kind === "single") {
    const matched = allAliases.find(
      (a) => a.data.slug.toString() === prefixResult.alias,
    );
    if (matched) {
      return Result.ok(createItemPlacement(matched.data.itemId, []));
    }
  }

  if (prefixResult.kind === "ambiguous") {
    return Result.error(
      createValidationError(PATH_RESOLVER_ERROR_KIND, [
        createValidationIssue(
          `ambiguous alias prefix '${token}': matches ${prefixResult.candidates.join(", ")}`,
          { code: "ambiguous_alias_prefix", path: [] },
        ),
      ]),
    );
  }

  return Result.error(
    createValidationError(PATH_RESOLVER_ERROR_KIND, [
      createValidationIssue(`alias '${token}' not found`, {
        code: "alias_not_found",
        path: [],
      }),
    ]),
  );
};

/**
 * Create a PathResolver service
 */
export const createPathResolver = (
  dependencies: PathResolverDependencies,
): PathResolver => {
  const { aliasRepository, timezone } = dependencies;
  const today = dependencies.today ?? new Date();

  const resolveToken = async (
    token: PathToken,
    context: { cwd: Placement; stack: Placement },
  ): Promise<Result<Placement | null, PathResolverError>> => {
    switch (token.kind) {
      case "dot":
        // Current location - no change
        return Result.ok(null);

      case "dotdot": {
        // First, try removing a section level
        const sectionParent = context.stack.parent();
        if (sectionParent !== null) {
          return Result.ok(sectionParent);
        }

        // No more sections - try navigating to parent item
        if (context.stack.head.kind === "item") {
          // Load the item to get its placement (parent)
          const itemResult = await dependencies.itemRepository.load(context.stack.head.id);
          if (itemResult.type === "error") {
            return Result.error(
              createValidationError(PATH_RESOLVER_ERROR_KIND, [
                createValidationIssue(
                  `failed to load item ${context.stack.head.id}: ${itemResult.error.message}`,
                  {
                    code: "item_load_failed",
                    path: [],
                  },
                ),
              ]),
            );
          }

          const item = itemResult.value;
          if (!item) {
            return Result.error(
              createValidationError(PATH_RESOLVER_ERROR_KIND, [
                createValidationIssue(
                  `item ${context.stack.head.id} not found`,
                  {
                    code: "item_not_found",
                    path: [],
                  },
                ),
              ]),
            );
          }

          // Navigate to the item's placement (its parent)
          return Result.ok(item.data.placement);
        }

        // Date or permanent head with no sections - cannot go higher
        return Result.error(
          createValidationError(PATH_RESOLVER_ERROR_KIND, [
            createValidationIssue("cannot navigate above root", {
              code: "invalid_parent",
              path: [],
            }),
          ]),
        );
      }

      case "relativeDate": {
        const dateResult = resolveDateExpression(token.expr, timezone, today);
        if (dateResult.type === "error") {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, dateResult.error.issues),
          );
        }
        return Result.ok(createDatePlacement(dateResult.value, []));
      }

      case "numeric": {
        // Append numeric section to current stack
        const newSection = [...context.stack.section, token.value];
        return Result.ok(createPlacement(context.stack.head, newSection));
      }

      case "idOrAlias": {
        // Try parsing as UUID first
        const idResult = parseItemId(token.value);
        if (idResult.type === "ok") {
          return Result.ok(createItemPlacement(idResult.value, []));
        }

        // Try parsing as alias
        const aliasResult = parseAliasSlug(token.value);
        if (aliasResult.type === "error") {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, [
              createValidationIssue(
                `'${token.value}' is not a valid UUID or alias`,
                {
                  code: "invalid_id_or_alias",
                  path: [],
                },
              ),
            ]),
          );
        }

        // Resolve alias to UUID
        const loadResult = await aliasRepository.load(aliasResult.value);
        if (loadResult.type === "error") {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, [
              createValidationIssue(
                `failed to resolve alias '${token.value}': ${loadResult.error.message}`,
                {
                  code: "alias_resolution_failed",
                  path: [],
                },
              ),
            ]),
          );
        }

        const alias = loadResult.value;
        if (alias) {
          return Result.ok(createItemPlacement(alias.data.itemId, []));
        }

        // Exact alias not found -- fall back to prefix resolution
        return resolveAliasByPrefix(token.value, aliasRepository);
      }

      case "permanent": {
        return Result.ok(createPermanentPlacement([]));
      }
    }
  };

  const resolvePath = async (
    cwd: Placement,
    expr: PathExpression,
  ): Promise<Result<Placement, PathResolverError>> => {
    // Validate absolute paths require a head segment
    if (expr.isAbsolute) {
      if (expr.segments.length === 0) {
        return Result.error(
          createValidationError(PATH_RESOLVER_ERROR_KIND, [
            createValidationIssue(
              "absolute path requires at least one segment to define head (date, item, or permanent)",
              { code: "absolute_path_missing_head" },
            ),
          ]),
        );
      }

      const firstToken = expr.segments[0];
      if (firstToken.kind === "numeric") {
        return Result.error(
          createValidationError(PATH_RESOLVER_ERROR_KIND, [
            createValidationIssue(
              "absolute path must start with date, item, or permanent, not numeric section",
              { code: "absolute_path_invalid_head" },
            ),
          ]),
        );
      }

      if (firstToken.kind === "dot" || firstToken.kind === "dotdot") {
        return Result.error(
          createValidationError(PATH_RESOLVER_ERROR_KIND, [
            createValidationIssue(
              "absolute path cannot start with navigation token (. or ..)",
              { code: "absolute_path_invalid_head" },
            ),
          ]),
        );
      }
    }

    let stack: Placement = expr.isAbsolute
      ? createDatePlacement(
        Result.unwrap(parseCalendarDay("1970-01-01")), // temp placeholder, will be replaced by first token
        [],
      )
      : cwd;

    for (const token of expr.segments) {
      const result = await resolveToken(token, { cwd, stack });
      if (result.type === "error") {
        return result;
      }

      if (result.value !== null) {
        stack = result.value;
      }
    }

    return Result.ok(stack);
  };

  const resolveRange = async (
    cwd: Placement,
    expr: RangeExpression,
  ): Promise<Result<PlacementRange, PathResolverError>> => {
    if (expr.kind === "single") {
      // Check if this is a period keyword (this-week, this-month, etc.)
      // Period keywords should expand to date ranges, not single dates
      const segments = expr.path.segments;
      if (
        segments.length === 1 &&
        segments[0].kind === "relativeDate" &&
        isPeriodKeyword(segments[0].expr)
      ) {
        const periodResult = resolvePeriodRange(segments[0].expr, timezone, today);
        if (periodResult.type === "error") {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, periodResult.error.issues),
          );
        }
        return Result.ok(createDateRange(periodResult.value.from, periodResult.value.to));
      }

      const pathResult = await resolvePath(cwd, expr.path);
      if (pathResult.type === "error") {
        return pathResult;
      }
      return Result.ok(createSingleRange(pathResult.value));
    }

    // Range: from..to
    const fromResult = await resolvePath(cwd, expr.from);
    if (fromResult.type === "error") {
      return fromResult;
    }

    const toResult = await resolvePath(cwd, expr.to);
    if (toResult.type === "error") {
      return toResult;
    }

    const from = fromResult.value;
    const to = toResult.value;

    // Determine range type based on heads
    if (from.head.kind === "date" && to.head.kind === "date") {
      // Both are dates - date range
      if (from.section.length === 0 && to.section.length === 0) {
        return Result.ok(createDateRange(from.head.date, to.head.date));
      }
    }

    // Check if they share the same parent and differ only in final section
    if (
      from.head.kind === to.head.kind &&
      from.section.length > 0 &&
      to.section.length > 0
    ) {
      // Validate that heads are actually equal (same date or same item id)
      let headsEqual = false;
      if (from.head.kind === "date" && to.head.kind === "date") {
        headsEqual = from.head.date.toString() === to.head.date.toString();
      } else if (from.head.kind === "item" && to.head.kind === "item") {
        headsEqual = from.head.id.toString() === to.head.id.toString();
      }

      if (!headsEqual) {
        // Different parent placements - return error
        return Result.error(
          createValidationError(PATH_RESOLVER_ERROR_KIND, [
            createValidationIssue(
              "numeric range endpoints must share the same parent placement",
              { code: "range_different_parents" },
            ),
          ]),
        );
      }

      const fromSectionPrefix = from.section.slice(0, -1);
      const toSectionPrefix = to.section.slice(0, -1);

      if (
        fromSectionPrefix.length === toSectionPrefix.length &&
        fromSectionPrefix.every((v, i) => v === toSectionPrefix[i])
      ) {
        const fromLast = from.section[from.section.length - 1];
        const toLast = to.section[to.section.length - 1];

        // Validate range bounds before calling createNumericRange
        if (!Number.isInteger(fromLast) || fromLast < 1) {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, [
              createValidationIssue(
                `invalid range start: ${fromLast} (must be positive integer)`,
                { code: "invalid_range_start" },
              ),
            ]),
          );
        }

        if (!Number.isInteger(toLast) || toLast < 1) {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, [
              createValidationIssue(
                `invalid range end: ${toLast} (must be positive integer)`,
                { code: "invalid_range_end" },
              ),
            ]),
          );
        }

        if (fromLast > toLast) {
          return Result.error(
            createValidationError(PATH_RESOLVER_ERROR_KIND, [
              createValidationIssue(
                `invalid range: ${fromLast}..${toLast} (start must be <= end)`,
                { code: "invalid_range_order" },
              ),
            ]),
          );
        }

        const parent = createPlacement(from.head, fromSectionPrefix);
        return Result.ok(createNumericRange(parent, fromLast, toLast));
      }
    }

    // Fallback: treat as single range of 'from'
    return Result.ok(createSingleRange(from));
  };

  return {
    resolvePath,
    resolveRange,
  };
};
