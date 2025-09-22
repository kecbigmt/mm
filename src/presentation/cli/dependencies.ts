import { isAbsolute, resolve } from "@std/path";
import { Result } from "../../shared/result.ts";
import {
  createFileSystemContainerRepository,
  createFileSystemItemRepository,
  createFileSystemWorkspaceRepository,
} from "../../infrastructure/fileSystem/mod.ts";
import { ContainerRepository } from "../../domain/repositories/container_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { WorkspaceRepository } from "../../domain/repositories/workspace_repository.ts";
import { WorkspaceSettings } from "../../domain/models/workspace.ts";
import { TimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { createRankService, RankService } from "../../domain/services/rank_service.ts";
import { createLexoRankGenerator } from "../../infrastructure/lexorank/generator.ts";
import {
  createIdGenerationService,
  IdGenerationService,
} from "../../domain/services/id_generation_service.ts";
import { createUuidV7Generator } from "../../infrastructure/uuid/generator.ts";
import { WorkspaceName, workspaceNameFromString } from "../../domain/primitives/workspace_name.ts";
import { createFileSystemConfigRepository } from "../../infrastructure/fileSystem/config_repository.ts";

export type CliDependencies = Readonly<{
  readonly root: string;
  readonly workspace: WorkspaceSettings;
  readonly timezone: TimezoneIdentifier;
  readonly itemRepository: ItemRepository;
  readonly containerRepository: ContainerRepository;
  readonly workspaceRepository: WorkspaceRepository;
  readonly rankService: RankService;
  readonly idGenerationService: IdGenerationService;
}>;

export type CliDependencyError =
  | { readonly type: "repository"; readonly error: RepositoryError }
  | { readonly type: "workspace"; readonly message: string };

type WorkspaceRootSources = Readonly<{
  readonly workspacePath?: string;
  readonly mmHome?: string;
  readonly home?: string;
  readonly userProfile?: string;
}>;

const normalizePathInput = (value?: string): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const safeGetEnv = (key: string): string | undefined => {
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
};

export const resolveWorkspaceRootFromSources = (
  sources: WorkspaceRootSources,
): Result<string, CliDependencyError> => {
  const explicit = normalizePathInput(sources.workspacePath);
  if (explicit) {
    return Result.ok(resolve(explicit));
  }

  const envRoot = normalizePathInput(sources.mmHome);
  if (envRoot) {
    return Result.ok(resolve(envRoot));
  }

  const home = normalizePathInput(sources.home);
  if (home) {
    return Result.ok(resolve(home, ".mm"));
  }

  const userProfile = normalizePathInput(sources.userProfile);
  if (userProfile) {
    return Result.ok(resolve(userProfile, ".mm"));
  }

  return Result.error({
    type: "workspace",
    message: "workspace root could not be determined; set --workspace, MM_HOME, or HOME",
  });
};

export const resolveMmHome = (): Result<string, CliDependencyError> =>
  resolveWorkspaceRootFromSources({
    mmHome: safeGetEnv("MM_HOME"),
    home: safeGetEnv("HOME"),
    userProfile: safeGetEnv("USERPROFILE"),
  });

const determineWorkspaceFromName = async (
  repository: WorkspaceRepository,
  name: WorkspaceName,
): Promise<Result<string, CliDependencyError>> => {
  const existsResult = await repository.exists(name);
  if (existsResult.type === "error") {
    return Result.error({ type: "repository", error: existsResult.error });
  }
  if (!existsResult.value) {
    return Result.error({
      type: "workspace",
      message:
        `workspace '${name.toString()}' does not exist; run mm workspace init ${name.toString()}`,
    });
  }
  return Result.ok(repository.pathFor(name));
};

const determineWorkspaceRoot = async (
  workspacePath: string | undefined,
  repository: WorkspaceRepository,
  configRepository: ReturnType<typeof createFileSystemConfigRepository>,
): Promise<Result<string, CliDependencyError>> => {
  const explicit = normalizePathInput(workspacePath);
  if (explicit) {
    if (
      isAbsolute(explicit) || explicit.includes("/") || explicit.includes("\\") ||
      explicit.startsWith(".")
    ) {
      const path = resolve(explicit);
      try {
        const stat = await Deno.stat(path);
        if (!stat.isDirectory) {
          return Result.error({
            type: "workspace",
            message: `workspace path '${path}' is not a directory`,
          });
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return Result.error({
            type: "workspace",
            message: `workspace path '${path}' does not exist`,
          });
        }
        return Result.error({
          type: "workspace",
          message: `failed to inspect workspace path '${path}'`,
        });
      }
      return Result.ok(path);
    }

    const parsedName = workspaceNameFromString(explicit);
    if (parsedName.type === "error") {
      return Result.error({
        type: "workspace",
        message: parsedName.error.issues[0]?.message ?? "invalid workspace name",
      });
    }
    return await determineWorkspaceFromName(repository, parsedName.value);
  }

  const currentResult = await configRepository.getCurrentWorkspace();
  if (currentResult.type === "error") {
    return Result.error({ type: "repository", error: currentResult.error });
  }

  const currentName = currentResult.value ?? "home";
  const parsedName = workspaceNameFromString(currentName);
  if (parsedName.type === "error") {
    return Result.error({
      type: "workspace",
      message: parsedName.error.issues[0]?.message ?? "workspace name is invalid",
    });
  }

  return await determineWorkspaceFromName(repository, parsedName.value);
};

export const loadCliDependencies = async (
  workspacePath?: string,
): Promise<Result<CliDependencies, CliDependencyError>> => {
  const homeResult = resolveMmHome();
  if (homeResult.type === "error") {
    return homeResult;
  }
  const home = homeResult.value;

  const workspaceRepository = createFileSystemWorkspaceRepository({ home });
  const configRepository = createFileSystemConfigRepository({ home });

  const rootResult = await determineWorkspaceRoot(
    workspacePath,
    workspaceRepository,
    configRepository,
  );
  if (rootResult.type === "error") {
    return rootResult;
  }

  const root = rootResult.value;
  const workspaceResult = await workspaceRepository.load(root);
  if (workspaceResult.type === "error") {
    return Result.error({ type: "repository", error: workspaceResult.error });
  }

  const workspace = workspaceResult.value;
  const timezone = workspace.data.timezone;
  if (!timezone) {
    return Result.error({
      type: "workspace",
      message: "workspace timezone is not configured",
    });
  }

  const itemRepository = createFileSystemItemRepository({ root });
  const containerRepository = createFileSystemContainerRepository({ root });
  const rankService = createRankService(createLexoRankGenerator());
  const idGenerationService = createIdGenerationService(createUuidV7Generator());

  return Result.ok({
    root,
    workspace,
    timezone,
    itemRepository,
    containerRepository,
    workspaceRepository,
    rankService,
    idGenerationService,
  });
};
