import { join } from "@std/path";
import { Result } from "../../shared/result.ts";
import {
  createRepositoryError,
  RepositoryError,
} from "../../domain/repositories/repository_error.ts";
import type { Directory } from "../../domain/primitives/directory.ts";
import { createDirectory } from "../../domain/primitives/directory.ts";
import type {
  SectionQueryService,
  SectionSummary,
} from "../../domain/services/section_query_service.ts";

const EDGE_FILE_SUFFIX = ".edge.json";

export type FileSystemSectionQueryServiceDependencies = Readonly<{
  readonly root: string;
}>;

/**
 * Create a file system-backed SectionQueryService.
 *
 * Reads section metadata from the graph index at:
 * - `.index/graph/dates/<date>/<section>/` for date heads
 * - `.index/graph/parents/<itemId>/<section>/` for item heads
 */
export const createFileSystemSectionQueryService = (
  deps: FileSystemSectionQueryServiceDependencies,
): SectionQueryService => {
  const { root } = deps;

  const listSections = async (
    parent: Directory,
  ): Promise<Result<ReadonlyArray<SectionSummary>, RepositoryError>> => {
    const directory = buildDirectoryPath(root, parent);

    try {
      const summaries: SectionSummary[] = [];

      for await (const entry of Deno.readDir(directory)) {
        if (!entry.isDirectory) {
          continue;
        }

        const sectionNum = parseInt(entry.name, 10);
        if (!Number.isInteger(sectionNum) || sectionNum < 1) {
          continue;
        }

        const childDirectory = createDirectory(parent.head, [...parent.section, sectionNum]);
        const childDir = join(directory, entry.name);

        const counts = await countDirectChildren(childDir);
        if (counts.itemCount > 0 || counts.sectionCount > 0) {
          summaries.push({
            directory: childDirectory,
            itemCount: counts.itemCount,
            sectionCount: counts.sectionCount,
          });
        }
      }

      summaries.sort((a, b) => {
        const aLast = a.directory.section[a.directory.section.length - 1] ?? 0;
        const bLast = b.directory.section[b.directory.section.length - 1] ?? 0;
        return aLast - bLast;
      });

      return Result.ok(summaries);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return Result.ok([]);
      }
      return Result.error(
        createRepositoryError("section", "list", "failed to read section directory", {
          identifier: parent.toString(),
          cause: error,
        }),
      );
    }
  };

  return { listSections };
};

const buildDirectoryPath = (root: string, dir: Directory): string => {
  if (dir.head.kind === "date") {
    const dateStr = dir.head.date.toString();
    const sectionPath = dir.section.join("/");
    return sectionPath
      ? join(root, ".index", "graph", "dates", dateStr, sectionPath)
      : join(root, ".index", "graph", "dates", dateStr);
  } else if (dir.head.kind === "item") {
    const itemId = dir.head.id.toString();
    const sectionPath = dir.section.join("/");
    return sectionPath
      ? join(root, ".index", "graph", "parents", itemId, sectionPath)
      : join(root, ".index", "graph", "parents", itemId);
  } else {
    // permanent directory
    const sectionPath = dir.section.join("/");
    return sectionPath
      ? join(root, ".index", "graph", "permanent", sectionPath)
      : join(root, ".index", "graph", "permanent");
  }
};

const countDirectChildren = async (
  dir: string,
): Promise<{ itemCount: number; sectionCount: number }> => {
  let itemCount = 0;
  let sectionCount = 0;

  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(EDGE_FILE_SUFFIX)) {
        itemCount++;
      } else if (entry.isDirectory) {
        const sectionNum = parseInt(entry.name, 10);
        if (Number.isInteger(sectionNum) && sectionNum >= 1) {
          sectionCount++;
        }
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  return { itemCount, sectionCount };
};
