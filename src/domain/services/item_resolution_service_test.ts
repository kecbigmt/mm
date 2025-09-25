import { assertEquals } from "@std/assert";
import { ItemResolutionService } from "./item_resolution_service.ts";
import { Item, parseItem } from "../models/item.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { Result } from "../../shared/result.ts";
import { AmbiguousShortIdError } from "../repositories/short_id_resolution_error.ts";
import { ItemId, ItemShortId } from "../primitives/mod.ts";

// Mock item for testing
const createMockItem = (id: string, title: string): Item => {
  const parseResult = parseItem({
    id,
    title,
    icon: "note",
    status: "open",
    placement: {
      kind: "item",
      parentId: "00000000-0000-7000-8000-000000000000",
      section: ":2024-01-01",
      rank: "a",
    },
    createdAt: "2024-01-01T12:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
  });
  if (parseResult.type === "error") {
    throw new Error(`Failed to create mock item: ${parseResult.error.message}`);
  }
  return parseResult.value;
};

// Mock repository for testing
const createMockRepository = (items: Item[]): ItemRepository => ({
  load: (id: ItemId) => {
    const found = items.find((item) => item.data.id.equals(id));
    return Promise.resolve(Result.ok(found));
  },
  save: (_item: Item) => Promise.resolve(Result.ok(undefined)),
  delete: (_id: ItemId) => Promise.resolve(Result.ok(undefined)),
  findByShortId: (shortId: ItemShortId) => {
    const shortIdStr = shortId.toString();
    const matching = items.filter((item) => item.data.id.toString().endsWith(shortIdStr));

    if (matching.length === 0) {
      return Promise.resolve(Result.ok(undefined));
    }

    if (matching.length > 1) {
      const ambiguousError: AmbiguousShortIdError = {
        kind: "ambiguous_short_id",
        shortId: shortIdStr,
        foundCount: matching.length,
        message: `Ambiguous short ID: ${shortIdStr} matches ${matching.length} items`,
      };
      return Promise.resolve(Result.error(ambiguousError));
    }

    return Promise.resolve(Result.ok(matching[0]));
  },
});

Deno.test("ItemResolutionService - resolves full UUID", async () => {
  const fullId = "019965a7-2789-740a-b8c1-1415904fd108";
  const mockItem = createMockItem(fullId, "Test Item");
  const repository = createMockRepository([mockItem]);

  const result = await ItemResolutionService.resolveItemId(
    fullId,
    { itemRepository: repository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value?.data.id.toString(), fullId);
  }
});

Deno.test("ItemResolutionService - resolves short ID", async () => {
  const fullId = "019965a7-2789-740a-b8c1-1415904fd109";
  const shortId = "04fd109"; // Last 7 chars
  const mockItem = createMockItem(fullId, "Test Item");
  const repository = createMockRepository([mockItem]);

  const result = await ItemResolutionService.resolveItemId(
    shortId,
    { itemRepository: repository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value?.data.id.toString(), fullId);
  }
});

Deno.test("ItemResolutionService - returns undefined for non-existent ID", async () => {
  const repository = createMockRepository([]);

  const result = await ItemResolutionService.resolveItemId(
    "01234567-89ab-7def-8012-3456789abcde",
    { itemRepository: repository },
  );

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value, undefined);
  }
});

Deno.test("ItemResolutionService - returns error for ambiguous short ID", async () => {
  const mockItem1 = createMockItem("019965a7-2789-740a-b8c1-1415904fd10a", "Item 1");
  const mockItem2 = createMockItem("019965a7-2789-740a-b8c1-2525904fd10a", "Item 2");
  const repository = createMockRepository([mockItem1, mockItem2]);

  const result = await ItemResolutionService.resolveItemId(
    "04fd10a", // This should match both items (last 7 chars)
    { itemRepository: repository },
  );

  assertEquals(result.type, "error");
  if (result.type === "error") {
    const error = result.error as AmbiguousShortIdError;
    assertEquals(error.kind, "ambiguous_short_id");
    assertEquals(error.foundCount, 2);
  }
});

Deno.test("ItemResolutionService - returns error for invalid format", async () => {
  const repository = createMockRepository([]);

  const result = await ItemResolutionService.resolveItemId(
    "invalid-id",
    { itemRepository: repository },
  );

  assertEquals(result.type, "error");
  // Should be a validation error for invalid format
});
