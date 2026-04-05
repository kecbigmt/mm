import { assertEquals } from "@std/assert";
import { snoozeItem } from "./snooze_item.ts";
import { createItem } from "../../domain/models/item.ts";
import { InMemoryAliasRepository } from "../../domain/repositories/alias_repository_fake.ts";
import { InMemoryItemRepository } from "../../domain/repositories/item_repository_fake.ts";
import {
  createItemIcon,
  dateTimeFromDate,
  Directory,
  itemIdFromString,
  itemRankFromString,
  itemStatusOpen,
  itemTitleFromString,
  parseDateTime,
  parseDirectory,
  parseTimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { Result } from "../../shared/result.ts";
import { createLexoRankService } from "../../infrastructure/lexorank/rank_service.ts";

const TEST_TIMEZONE = Result.unwrap(parseTimezoneIdentifier("UTC"));
const TEST_CWD: Directory = Result.unwrap(parseDirectory("2025-12-02"));

const createDeps = () => ({
  itemRepository: new InMemoryItemRepository(),
  aliasRepository: new InMemoryAliasRepository(),
  rankService: createLexoRankService(),
});

const createTestItem = (
  idSuffix: string,
  overrides: { directory?: string; snoozeUntil?: string } = {},
) => {
  const id = Result.unwrap(itemIdFromString(`01936d9a-${idSuffix}-7000-8000-000000000000`));
  const now = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T09:00:00Z")));
  return createItem({
    id,
    title: Result.unwrap(itemTitleFromString("Test Item")),
    icon: createItemIcon("note"),
    status: itemStatusOpen(),
    directory: Result.unwrap(parseDirectory(overrides.directory ?? "2025-12-02")),
    rank: Result.unwrap(itemRankFromString("a")),
    createdAt: now,
    updatedAt: now,
    ...(overrides.snoozeUntil
      ? { snoozeUntil: Result.unwrap(parseDateTime(overrides.snoozeUntil)) }
      : {}),
  });
};

Deno.test("snoozeItem snoozes with default duration (8h) and returns DTO", async () => {
  const deps = createDeps();
  const item = createTestItem("0001");
  deps.itemRepository.set(item);

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));

  const result = await snoozeItem({
    itemLocator: item.data.id.toString(),
    cwd: TEST_CWD,
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.snoozeUntil, "2025-12-02T18:00:00.000Z");
  assertEquals(result.value.item.directory, "2025-12-02");
  assertEquals(typeof result.value.item.id, "string");
  assertEquals(Object.isFrozen(result.value.item), true);
});

Deno.test("snoozeItem relocates to future date directory when snoozeUntil exceeds current", async () => {
  const deps = createDeps();
  const item = createTestItem("0002");
  deps.itemRepository.set(item);

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));
  const snoozeUntil = Result.unwrap(parseDateTime("2025-12-03T00:00:00Z"));

  const result = await snoozeItem({
    itemLocator: item.data.id.toString(),
    cwd: TEST_CWD,
    snoozeUntil,
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.snoozeUntil, "2025-12-03T00:00:00.000Z");
  assertEquals(result.value.item.directory, "2025-12-03");
});

Deno.test("snoozeItem clears snooze when clear flag is true", async () => {
  const deps = createDeps();
  const item = createTestItem("0003", { snoozeUntil: "2025-12-02T18:00:00Z" });
  deps.itemRepository.set(item);

  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));

  const result = await snoozeItem({
    itemLocator: item.data.id.toString(),
    cwd: TEST_CWD,
    clear: true,
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, deps);

  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.item.snoozeUntil, undefined);
});

Deno.test("snoozeItem returns validation error for unknown item", async () => {
  const deps = createDeps();
  const occurredAt = Result.unwrap(dateTimeFromDate(new Date("2025-12-02T10:00:00Z")));

  const result = await snoozeItem({
    itemLocator: "01936d9a-9999-7000-8000-000000000000",
    cwd: TEST_CWD,
    timezone: TEST_TIMEZONE,
    occurredAt,
  }, deps);

  assertEquals(result.type, "error");
  if (result.type !== "error") return;
  assertEquals(result.error.kind, "ValidationError");
  if (result.error.kind !== "ValidationError") return;
  assertEquals(result.error.objectKind, "SnoozeItem");
  assertEquals(result.error.issues[0]?.path, ["itemLocator"]);
});
