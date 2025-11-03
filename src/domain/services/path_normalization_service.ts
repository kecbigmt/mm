import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { parsePath, Path } from "../primitives/path.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { LocatorResolutionService } from "./locator_resolution_service.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type PathNormalizationError = ValidationError<"PathNormalization"> | RepositoryError;

export type PathNormalizationDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
  readonly aliasRepository: AliasRepository;
}>;

export type PathNormalizationOptions = Readonly<{
  /**
   * If true, preserves alias segments in the normalized path.
   * If false, resolves aliases to item paths (removes alias segments).
   *
   * Examples:
   * - preserveAlias: false -> `/2024-01-01/chapter1/1` -> `/2024-01-01/019965a7-.../1`
   * - preserveAlias: true -> `/2024-01-01/chapter1/1` -> `/2024-01-01/019965a7-.../chapter1/1`
   */
  readonly preserveAlias?: boolean;
}>;

/**
 * Normalizes a Path by resolving aliases to item paths.
 * This removes alias segments and replaces them with the actual item path,
 * while preserving numeric sections and other segments.
 *
 * For example:
 * - `/2024-01-01/chapter1/1` -> `/2024-01-01/019965a7-.../1` (if chapter1 is an alias, preserveAlias: false)
 * - `/2024-01-01/chapter1/1` -> `/2024-01-01/019965a7-.../chapter1/1` (if chapter1 is an alias, preserveAlias: true)
 * - `/2024-01-01/019965a7-.../1` -> `/2024-01-01/019965a7-.../1` (no change)
 */
export const PathNormalizationService = {
  /**
   * Normalizes a Path by resolving aliases to item paths.
   *
   * @param path - The path to normalize
   * @param deps - Dependencies for resolving items and aliases
   * @param options - Normalization options (preserveAlias: true for display/storage, false for comparison)
   * @returns Normalized path, or error if resolution fails
   */
  async normalize(
    path: Path,
    deps: PathNormalizationDependencies,
    options: PathNormalizationOptions = {},
  ): Promise<Result<Path, PathNormalizationError>> {
    const preserveAlias = options.preserveAlias ?? false;

    // If path starts with a date, check if normalization is needed
    if (path.segments.length > 0 && path.segments[0].kind === "Date") {
      // Check if there are any alias segments after the date
      let needsNormalization = false;
      for (let i = 1; i < path.segments.length; i += 1) {
        const segment = path.segments[i];
        if (segment.kind === "ItemAlias") {
          needsNormalization = true;
          break;
        }
      }
      if (!needsNormalization) {
        return Result.ok(path);
      }
    }

    // If path doesn't start with an item alias or ID, return as-is
    if (path.segments.length === 0) {
      return Result.ok(path);
    }

    const firstSegment = path.segments[0];
    if (firstSegment.kind !== "ItemAlias" && firstSegment.kind !== "ItemId") {
      return Result.ok(path);
    }

    // Resolve the item
    const itemIdentifier = firstSegment.toString();
    const resolveResult = await LocatorResolutionService.resolveItem(
      itemIdentifier,
      deps,
    );

    if (resolveResult.type === "error") {
      // Map LocatorResolutionError to PathNormalizationError
      if (resolveResult.error.kind === "ValidationError") {
        return Result.error(
          createValidationError("PathNormalization", resolveResult.error.issues),
        );
      }
      // RepositoryError can be passed through
      return Result.error(resolveResult.error);
    }

    if (!resolveResult.value) {
      // Item not found, but return the original path
      // (let the caller handle the error)
      return Result.ok(path);
    }

    const item = resolveResult.value;
    const remainingSegments = path.segments.slice(1);

    // Build base path
    let basePath: Path;
    if (preserveAlias && item.data.alias) {
      // Preserve alias: item path + alias
      const basePathStr = `${item.data.path.toString()}/${item.data.alias.toString()}`;
      const basePathResult = parsePath(basePathStr);
      if (basePathResult.type === "ok") {
        basePath = basePathResult.value;
      } else {
        // Fallback to item path if parsing fails
        basePath = item.data.path;
      }
    } else {
      // Resolve alias: use item path only (without alias)
      basePath = item.data.path;
    }

    // Append remaining segments (numeric sections, etc.)
    if (remainingSegments.length > 0) {
      let builtPath = basePath;
      for (const segment of remainingSegments) {
        if (segment.kind !== "range") {
          builtPath = builtPath.appendSegment(segment);
        }
      }
      return Result.ok(builtPath);
    }

    return Result.ok(basePath);
  },
};
