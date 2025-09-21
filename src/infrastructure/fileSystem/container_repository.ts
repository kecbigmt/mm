import { join } from "jsr:@std/path";
import { Result } from "../../shared/result.ts";
import { ContainerRepository } from "../../domain/repositories/container_repository.ts";
import { Container, ContainerSnapshot, parseContainer } from "../../domain/models/container.ts";
import { ContainerPath } from "../../domain/primitives/mod.ts";
import { createRepositoryError } from "../../domain/repositories/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { readEdgeSnapshots, writeEdges } from "./edge_store.ts";
import { Edge } from "../../domain/models/edge.ts";

export type FileSystemContainerRepositoryDependencies = Readonly<{
  readonly root: string;
}>;

type LoadResult = Result<Container | undefined, RepositoryError>;
type EnsureResult = Result<Container, RepositoryError>;
type ReplaceEdgesResult = Result<void, RepositoryError>;

const nodesDirectory = (root: string): string => join(root, "nodes");

const containerDirectory = (root: string, path: ContainerPath): string => {
  const segments = path.segments();
  return join(nodesDirectory(root), ...segments);
};

const containerEdgesDirectory = (root: string, path: ContainerPath): string =>
  join(containerDirectory(root, path), "edges");

const pathString = (path: ContainerPath): string => path.isRoot() ? "/" : path.toString();

const containerFromSnapshots = (
  snapshot: ContainerSnapshot,
): Result<Container, RepositoryError> => {
  const parsed = parseContainer(snapshot);
  if (parsed.type === "error") {
    return Result.error(
      createRepositoryError(
        "container",
        "load",
        "container data is invalid",
        { identifier: snapshot.path, cause: parsed.error },
      ),
    );
  }
  return Result.ok(parsed.value);
};

const loadEdges = async (
  root: string,
  path: ContainerPath,
): Promise<Result<ContainerSnapshot, RepositoryError>> => {
  const edgesResult = await readEdgeSnapshots({
    directory: containerEdgesDirectory(root, path),
    scope: "container",
    identifier: pathString(path),
  });
  if (edgesResult.type === "error") {
    return edgesResult;
  }
  return Result.ok({
    path: pathString(path),
    edges: edgesResult.value,
  });
};

const directoryExists = async (dir: string): Promise<Result<boolean, RepositoryError>> => {
  try {
    await Deno.stat(dir);
    return Result.ok(true);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Result.ok(false);
    }
    return Result.error(
      createRepositoryError("container", "load", "failed to inspect container directory", {
        cause: error,
      }),
    );
  }
};

export const createFileSystemContainerRepository = (
  dependencies: FileSystemContainerRepositoryDependencies,
): ContainerRepository => {
  const load = async (path: ContainerPath): Promise<LoadResult> => {
    const dir = containerDirectory(dependencies.root, path);
    if (!path.isRoot()) {
      const exists = await directoryExists(dir);
      if (exists.type === "error") {
        return exists;
      }
      if (!exists.value) {
        return Result.ok(undefined);
      }
    }

    const snapshotResult = await loadEdges(dependencies.root, path);
    if (snapshotResult.type === "error") {
      return snapshotResult;
    }

    const containerResult = containerFromSnapshots(snapshotResult.value);
    if (containerResult.type === "error") {
      return containerResult;
    }

    return Result.ok(containerResult.value);
  };

  const ensure = async (path: ContainerPath): Promise<EnsureResult> => {
    try {
      await Deno.mkdir(containerDirectory(dependencies.root, path), { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        return Result.error(
          createRepositoryError("container", "ensure", "failed to prepare container directory", {
            identifier: pathString(path),
            cause: error,
          }),
        );
      }
    }

    const loadResult = await load(path);
    if (loadResult.type === "error") {
      return loadResult;
    }
    if (loadResult.value) {
      return Result.ok(loadResult.value);
    }

    const parsed = containerFromSnapshots({ path: pathString(path), edges: [] });
    if (parsed.type === "error") {
      return parsed;
    }
    return Result.ok(parsed.value);
  };

  const replaceEdges = async (
    path: ContainerPath,
    edges: ReadonlyArray<Edge>,
  ): Promise<ReplaceEdgesResult> => {
    try {
      await Deno.mkdir(containerDirectory(dependencies.root, path), { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        return Result.error(
          createRepositoryError("container", "replace", "failed to prepare container directory", {
            identifier: pathString(path),
            cause: error,
          }),
        );
      }
    }

    return await writeEdges(edges, {
      directory: containerEdgesDirectory(dependencies.root, path),
      scope: "container",
      identifier: pathString(path),
    });
  };

  return {
    load,
    ensure,
    replaceEdges,
  };
};
