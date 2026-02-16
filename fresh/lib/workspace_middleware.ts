import type { FreshContext } from "fresh";
import type { State } from "../utils.ts";
import {
  createFileSystemAliasRepository,
  createFileSystemItemRepository,
  createFileSystemWorkspaceRepository,
} from "../../src/infrastructure/fileSystem/mod.ts";
import { createSha256HashingService } from "../../src/infrastructure/hash/sha256_hashing_service.ts";
import type { ItemRepository } from "../../src/domain/repositories/item_repository.ts";
import type { TimezoneIdentifier } from "../../src/domain/primitives/timezone_identifier.ts";

let cachedRepository: ItemRepository | null = null;
let cachedTimezone: TimezoneIdentifier | null = null;
let initialized = false;

const initializeWorkspace = async (): Promise<
  {
    itemRepository: ItemRepository;
    timezone: TimezoneIdentifier;
  } | null
> => {
  if (initialized && cachedRepository && cachedTimezone) {
    return { itemRepository: cachedRepository, timezone: cachedTimezone };
  }

  try {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (!home) {
      console.error("HOME or USERPROFILE not set");
      return null;
    }

    const mmHome = Deno.env.get("MM_HOME") ?? `${home}/.mm`;
    const workspaceRepository = createFileSystemWorkspaceRepository({
      home: mmHome,
    });

    // Get current workspace (default to "main")
    const workspaceName = "main";
    const root = workspaceRepository.pathFor(
      {
        kind: "WorkspaceName",
        toString: () => workspaceName,
      } as ReturnType<
        typeof import("../../src/domain/primitives/workspace_name.ts").workspaceNameFromString
      >["value"],
    );

    const workspaceResult = await workspaceRepository.load(root);
    if (workspaceResult.type === "error") {
      console.error("Failed to load workspace:", workspaceResult.error);
      return null;
    }

    const workspace = workspaceResult.value;
    const timezone = workspace.data.timezone;
    if (!timezone) {
      console.error("Workspace timezone not configured");
      return null;
    }

    const hashingService = createSha256HashingService();
    const aliasRepository = createFileSystemAliasRepository({
      root,
      hashingService,
    });
    const itemRepository = createFileSystemItemRepository({
      root,
      timezone,
      aliasRepository,
    });

    cachedRepository = itemRepository;
    cachedTimezone = timezone;
    initialized = true;

    console.log(`Workspace loaded: ${root}`);
    return { itemRepository, timezone };
  } catch (error) {
    console.error("Failed to initialize workspace:", error);
    return null;
  }
};

export const workspaceMiddleware = async (
  ctx: FreshContext<State>,
): Promise<Response> => {
  const workspace = await initializeWorkspace();
  if (workspace) {
    ctx.state.itemRepository = workspace.itemRepository;
    ctx.state.timezone = workspace.timezone;
  }
  return ctx.next();
};
