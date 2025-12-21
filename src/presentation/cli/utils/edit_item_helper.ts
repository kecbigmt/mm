import type { Item } from "../../../domain/models/item.ts";
import type { ItemId } from "../../../domain/primitives/item_id.ts";
import type { DateTime } from "../../../domain/primitives/date_time.ts";
import type { ItemRepository } from "../../../domain/repositories/item_repository.ts";
import type { AliasRepository } from "../../../domain/repositories/alias_repository.ts";
import type { CacheUpdateService } from "../../../infrastructure/completion_cache/cache_update_service.ts";

/**
 * Launch the user's preferred editor to edit a file.
 * Uses $EDITOR environment variable, defaults to 'vi' if not set.
 */
export const launchEditor = async (filePath: string): Promise<void> => {
  const editor = Deno.env.get("EDITOR") || "vi";
  const command = new Deno.Command(editor, {
    args: [filePath],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = command.spawn();
  const status = await child.status;
  if (!status.success) {
    throw new Error(`Editor '${editor}' exited with non-zero status`);
  }
};

export interface PostEditDependencies {
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  cacheUpdateService: CacheUpdateService;
}

export interface PostEditParams {
  itemId: ItemId;
  oldAlias: Item["data"]["alias"];
  occurredAt: DateTime;
}

/**
 * Handle updates after editing an item in the editor.
 * Reloads the item, updates alias index if changed, and updates cache.
 *
 * @returns The reloaded item after successful updates
 * @throws Error if reload fails, alias collision detected, or alias/cache update fails
 */
export const handlePostEditUpdates = async (
  deps: PostEditDependencies,
  params: PostEditParams,
): Promise<Item> => {
  const reloadResult = await deps.itemRepository.load(params.itemId);

  if (reloadResult.type === "error") {
    throw new Error(`Failed to reload item after edit: ${reloadResult.error.message}`);
  }

  if (!reloadResult.value) {
    throw new Error("Failed to reload item after edit: item not found");
  }

  const updatedItem = reloadResult.value;
  const newAlias = updatedItem.data.alias;

  // Update alias index if alias changed
  const oldAliasStr = params.oldAlias?.toString();
  const newAliasStr = newAlias?.toString();

  if (oldAliasStr !== newAliasStr) {
    // Check for alias collision before updating
    if (newAlias) {
      const existingAliasResult = await deps.aliasRepository.load(newAlias);
      if (existingAliasResult.type === "error") {
        throw new Error(`Failed to check alias collision: ${existingAliasResult.error.message}`);
      }
      if (existingAliasResult.value) {
        // Alias exists and points to a different item
        if (!existingAliasResult.value.data.itemId.equals(updatedItem.data.id)) {
          throw new Error(`Alias '${newAlias.toString()}' is already in use by another item`);
        }
      }
    }

    // Delete old alias if it exists
    if (params.oldAlias) {
      const deleteResult = await deps.aliasRepository.delete(params.oldAlias);
      if (deleteResult.type === "error") {
        throw new Error(`Failed to delete old alias: ${deleteResult.error.message}`);
      }
    }

    // Save new alias if it exists
    if (newAlias) {
      const { createAlias } = await import("../../../domain/models/alias.ts");
      const aliasModel = createAlias({
        slug: newAlias,
        itemId: updatedItem.data.id,
        createdAt: params.occurredAt,
      });
      const aliasSaveResult = await deps.aliasRepository.save(aliasModel);
      if (aliasSaveResult.type === "error") {
        throw new Error(`Failed to save new alias: ${aliasSaveResult.error.message}`);
      }
    }
  }

  // Update cache after all validations and persists succeed
  await deps.cacheUpdateService.updateFromItem(updatedItem);

  return updatedItem;
};
