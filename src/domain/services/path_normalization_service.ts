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

    if (path.segments.length === 0) {
      return Result.ok(path);
    }

    const canonicalSegments: string[] = [];
    const displaySegments: string[] = [];

    const ensurePrefix = (targetSegments: string[]): Result<void, PathNormalizationError> => {
      for (let index = 0; index < targetSegments.length; index += 1) {
        const expected = targetSegments[index];
        if (canonicalSegments[index] === undefined) {
          canonicalSegments.push(expected);
          displaySegments.push(expected);
        } else if (canonicalSegments[index] !== expected) {
          return Result.error(
            createValidationError("PathNormalization", [
              createValidationIssue("alias path does not match item placement", {
                code: "alias_context_mismatch",
                path: ["value"],
              }),
            ]),
          );
        }
      }
      canonicalSegments.length = targetSegments.length;
      displaySegments.length = targetSegments.length;
      return Result.ok(undefined);
    };

    for (const segment of path.segments) {
      switch (segment.kind) {
        case "Date":
        case "Numeric": {
          canonicalSegments.push(segment.toString());
          displaySegments.push(segment.toString());
          break;
        }
        case "ItemId": {
          canonicalSegments.push(segment.toString());
          displaySegments.push(segment.toString());
          break;
        }
        case "ItemAlias": {
          const resolveResult = await LocatorResolutionService.resolveItem(
            segment.toString(),
            deps,
          );

          if (resolveResult.type === "error") {
            if (resolveResult.error.kind === "ValidationError") {
              return Result.error(
                createValidationError("PathNormalization", resolveResult.error.issues),
              );
            }
            return Result.error(resolveResult.error);
          }

          const item = resolveResult.value;
          if (!item) {
            return Result.error(
              createValidationError("PathNormalization", [
                createValidationIssue(`alias not found: ${segment.toString()}`, {
                  code: "alias_not_found",
                  path: ["value"],
                }),
              ]),
            );
          }

          const parentSegments = item.data.path.segments.map((seg) => seg.toString());
          const prefixResult = ensurePrefix(parentSegments);
          if (prefixResult.type === "error") {
            return prefixResult;
          }

          canonicalSegments.push(item.data.id.toString());
          if (preserveAlias && item.data.alias) {
            displaySegments.push(item.data.alias.toString());
          } else {
            displaySegments.push(item.data.id.toString());
          }
          break;
        }
        default: {
          return Result.error(
            createValidationError("PathNormalization", [
              createValidationIssue("unsupported segment in path", {
                code: "unsupported_segment",
                path: ["value"],
              }),
            ]),
          );
        }
      }
    }

    const toPath = (segments: string[]): Result<Path, PathNormalizationError> => {
      const value = segments.length === 0 ? "/" : `/${segments.join("/")}`;
      const parsedResult = parsePath(value);
      if (parsedResult.type === "error") {
        return Result.error(
          createValidationError("PathNormalization", parsedResult.error.issues),
        );
      }
      return Result.ok(parsedResult.value);
    };

    if (preserveAlias) {
      return toPath(displaySegments.length > 0 ? displaySegments : canonicalSegments);
    }
    return toPath(canonicalSegments);
  },
};
