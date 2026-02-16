import { createItem, parseItem } from "./item.ts";
import {
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemId,
  parseItemRank,
} from "../primitives/mod.ts";

const assert = (condition: unknown, message?: string): void => {
  if (!condition) {
    throw new Error(message ?? "assertion failed");
  }
};

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

// Sample UUIDs for testing project/context references
const PROJECT_UUID_1 = "019965a7-0001-7000-8000-000000000001";
const CONTEXT_UUID_1 = "019965a7-0002-7000-8000-000000000002";
const CONTEXT_UUID_2 = "019965a7-0003-7000-8000-000000000003";

const baseSnapshot = (
  overrides: Partial<Parameters<typeof parseItem>[0]> = {},
): Parameters<typeof parseItem>[0] => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Test item",
  icon: "note",
  status: "open",
  directory: "2024-09-20",
  rank: "a",
  createdAt: "2024-09-20T12:00:00Z",
  updatedAt: "2024-09-20T12:00:00Z",
  contexts: [CONTEXT_UUID_1],
  ...overrides,
});

Deno.test("parseItem parses full snapshot payload", () => {
  const snapshot = baseSnapshot({
    title: "Detailed item",
    icon: "task",
    status: "closed",
    directory: "2024-09-21",
    rank: "b1",
    alias: "focus-work",
    project: PROJECT_UUID_1,
    contexts: [CONTEXT_UUID_1, CONTEXT_UUID_2],
    body: "Example body",
    closedAt: "2024-09-21T06:00:00Z",
    startAt: "2024-09-22T08:00:00Z",
    duration: "1h30m",
    dueAt: "2024-09-22T10:00:00Z",
    createdAt: "2024-09-20T08:00:00Z",
    updatedAt: "2024-09-21T14:00:00Z",
  });

  const result = parseItem(snapshot);
  if (result.type !== "ok") {
    throw new Error(`expected ok result, got error: ${result.error.toString()}`);
  }

  const item = result.value;
  assertEquals(item.data.title.toString(), "Detailed item");
  assertEquals(item.data.icon.toString(), "task");
  assertEquals(item.data.status.toString(), "closed");
  assertEquals(item.data.rank.toString(), "b1");
  assertEquals(item.data.directory.toString(), "2024-09-21");
  assertEquals(item.data.alias?.toString(), "focus-work");
  assertEquals(item.data.project?.toString(), PROJECT_UUID_1);
  assertEquals(item.data.contexts?.length, 2);
  assertEquals(item.data.contexts?.[0].toString(), CONTEXT_UUID_1);
  assertEquals(item.data.contexts?.[1].toString(), CONTEXT_UUID_2);
  assertEquals(item.data.body, "Example body");
  assertEquals(item.data.closedAt?.toString(), "2024-09-21T06:00:00.000Z");
  assertEquals(item.data.startAt?.toString(), "2024-09-22T08:00:00.000Z");
  assertEquals(item.data.duration?.toMinutes(), 90);
  assertEquals(item.data.dueAt?.toString(), "2024-09-22T10:00:00.000Z");
  assertEquals(item.data.createdAt.toString(), "2024-09-20T08:00:00.000Z");
  assertEquals(item.data.updatedAt.toString(), "2024-09-21T14:00:00.000Z");
  assertEquals(item.edges.length, 0);
  assertEquals(item.itemEdges().length, 0);
});

Deno.test("parseItem parses edges collection", () => {
  const result = parseItem(
    baseSnapshot({
      edges: [
        {
          kind: "ItemEdge",
          to: "019965a7-2789-740a-b8c1-1415904fd109",
          rank: "b1",
        },
      ],
    }),
  );

  const item = unwrapOk(result, "parse item with edges");
  assertEquals(item.edges.length, 1);
  assertEquals(item.edges[0].kind, "ItemEdge");
  assertEquals(item.itemEdges().length, 1);

  const roundTrip = item.toJSON();
  assert(roundTrip.edges !== undefined, "edges should be serialized");
  assertEquals(roundTrip.edges?.length, 1);
  assertEquals(roundTrip.directory, "2024-09-20");
});

Deno.test("parseItem requires directory metadata", () => {
  const { directory: _directory, ...legacySnapshot } = baseSnapshot();
  const result = parseItem(legacySnapshot as unknown as Parameters<typeof parseItem>[0]);
  if (result.type !== "error") {
    throw new Error("expected directory validation error");
  }
  assert(
    result.error.issues.some((issue) => issue.path[0] === "directory"),
    "directory issues should be reported",
  );
});

Deno.test("Item.close transitions to closed state", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const closedAt = unwrapOk(parseDateTime("2024-09-21T06:00:00Z"), "parse closedAt");
  const closed = item.close(closedAt);

  assertEquals(closed.data.status.toString(), "closed");
  assert(closed.data.closedAt?.equals(closedAt), "closedAt should match");
  assert(closed.data.updatedAt.equals(closedAt), "updatedAt should match close timestamp");
  assertEquals(item.data.status.toString(), "open");
});

Deno.test("Item.reopen clears closed state", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const closedAt = unwrapOk(parseDateTime("2024-09-21T06:00:00Z"), "parse closedAt");
  const closed = base.close(closedAt);

  const reopenedAt = unwrapOk(parseDateTime("2024-09-21T09:00:00Z"), "parse reopenedAt");
  const reopened = closed.reopen(reopenedAt);

  assertEquals(reopened.data.status.toString(), "open");
  assertEquals(reopened.data.closedAt, undefined);
  assert(reopened.data.updatedAt.equals(reopenedAt), "updatedAt should match reopen timestamp");
  assertEquals(closed.data.status.toString(), "closed");
});

Deno.test("Item.relocate updates directory and rank", async () => {
  const { parseDirectory } = await import("../primitives/directory.ts");
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const targetRank = unwrapOk(parseItemRank("b1"), "parse rank");
  const targetDirectory = unwrapOk(
    parseDirectory("019965a7-2789-740a-b8c1-1415904fd109/1"),
    "parse directory",
  );
  const relocateAt = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse relocate timestamp");

  const relocated = base.relocate(targetDirectory, targetRank, relocateAt);
  assertEquals(relocated.data.rank.toString(), "b1");
  assertEquals(
    relocated.data.directory.toString(),
    "019965a7-2789-740a-b8c1-1415904fd109/1",
  );
  assert(relocated.data.updatedAt.equals(relocateAt), "updatedAt should match relocate timestamp");

  const unchanged = relocated.relocate(targetDirectory, targetRank, relocateAt);
  assertEquals(
    unchanged,
    relocated,
    "relocating to same directory and rank should return same instance",
  );
});

Deno.test("createItem creates immutable copies", () => {
  const snapshot = baseSnapshot();
  const item = unwrapOk(parseItem(snapshot), "parse item");

  const clone = createItem(item.data, { edges: item.edges });
  assertEquals(clone.data.id.toString(), item.data.id.toString());
  assertEquals(clone.edges.length, item.edges.length);
});

Deno.test("parseItem trims body", () => {
  const snapshot = baseSnapshot({ body: "  Example body  " });
  const item = unwrapOk(parseItem(snapshot), "parse item");
  assertEquals(item.data.body, "Example body");
});

Deno.test("Item.toJSON reflects current data", async () => {
  const { parseDirectory } = await import("../primitives/directory.ts");
  const base = unwrapOk(parseItem(baseSnapshot({ body: "Body" })), "parse item");
  const alias = unwrapOk(parseAliasSlug("focus"), "parse alias");
  const project = unwrapOk(parseItemId(PROJECT_UUID_1), "parse project");
  const context1 = unwrapOk(parseItemId(CONTEXT_UUID_1), "parse context1");
  const context2 = unwrapOk(parseItemId(CONTEXT_UUID_2), "parse context2");
  const relocateAt = unwrapOk(parseDateTime("2024-09-22T10:00:00Z"), "parse relocateAt");
  const newDirectory = unwrapOk(parseDirectory("2024-09-22"), "parse directory");
  const newRank = unwrapOk(parseItemRank("b2"), "parse rank");
  const startAt = unwrapOk(parseDateTime("2024-09-22T11:00:00Z"), "parse startAt");
  const dueAt = unwrapOk(parseDateTime("2024-09-22T12:30:00Z"), "parse dueAt");
  const duration = unwrapOk(parseDuration("30m"), "parse duration");

  const scheduled = base.schedule({ startAt, dueAt, duration }, relocateAt)
    .setAlias(alias, relocateAt)
    .setProject(project, relocateAt)
    .setContexts([context1, context2], relocateAt)
    .relocate(newDirectory, newRank, relocateAt)
    .close(relocateAt);

  const snapshot = scheduled.toJSON();

  assertEquals(snapshot.id, base.data.id.toString());
  assertEquals(snapshot.alias, "focus");
  assertEquals(snapshot.project, PROJECT_UUID_1);
  assertEquals(snapshot.contexts?.length, 2);
  assertEquals(snapshot.contexts?.[0], CONTEXT_UUID_1);
  assertEquals(snapshot.contexts?.[1], CONTEXT_UUID_2);
  assertEquals(snapshot.status, "closed");
  assertEquals(snapshot.closedAt, relocateAt.toString());
  assertEquals(snapshot.directory, newDirectory.toString());
  assertEquals(snapshot.rank, newRank.toString());
  assertEquals(snapshot.startAt, startAt.toString());
  assertEquals(snapshot.dueAt, dueAt.toString());
  assertEquals(snapshot.duration, duration.toString());
  assertEquals(snapshot.body, "Body");
  assert(snapshot.edges === undefined, "edges should be omitted when empty");
});

Deno.test("Item.setBody normalizes whitespace", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T12:00:00Z"), "parse updatedAt");
  const updated = item.setBody("  Updated body  ", updatedAt);
  assertEquals(updated.data.body, "Updated body");
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.schedule replaces scheduling fields", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const updatedAt = unwrapOk(parseDateTime("2024-09-22T08:00:00Z"), "parse updatedAt");
  const startAt = unwrapOk(parseDateTime("2024-09-22T09:00:00Z"), "parse startAt");
  const dueAt = unwrapOk(parseDateTime("2024-09-22T11:00:00Z"), "parse dueAt");
  const duration = unwrapOk(parseDuration("1h"), "parse duration");

  const scheduled = item.schedule({ startAt, dueAt, duration }, updatedAt);
  assert(scheduled.data.startAt?.equals(startAt));
  assert(scheduled.data.dueAt?.equals(dueAt));
  assertEquals(scheduled.data.duration?.toMinutes(), 60);
});

Deno.test("Item.setAlias updates alias", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const alias = unwrapOk(parseAliasSlug("focus"), "parse alias");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T13:00:00Z"), "parse updatedAt");
  const updated = item.setAlias(alias, updatedAt);
  assertEquals(updated.data.alias?.toString(), "focus");
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.setProject updates project", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const project = unwrapOk(parseItemId(PROJECT_UUID_1), "parse project");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse updatedAt");
  const updated = item.setProject(project, updatedAt);
  assertEquals(updated.data.project?.toString(), PROJECT_UUID_1);
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.setProject clears project when undefined", () => {
  const item = unwrapOk(parseItem(baseSnapshot({ project: PROJECT_UUID_1 })), "parse item");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse updatedAt");
  const updated = item.setProject(undefined, updatedAt);
  assertEquals(updated.data.project, undefined);
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.setContexts updates contexts", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const context1 = unwrapOk(parseItemId(CONTEXT_UUID_1), "parse context1");
  const context2 = unwrapOk(parseItemId(CONTEXT_UUID_2), "parse context2");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse updatedAt");
  const updated = item.setContexts([context1, context2], updatedAt);
  assertEquals(updated.data.contexts?.length, 2);
  assertEquals(updated.data.contexts?.[0].toString(), CONTEXT_UUID_1);
  assertEquals(updated.data.contexts?.[1].toString(), CONTEXT_UUID_2);
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.setContexts clears contexts when empty array", () => {
  const item = unwrapOk(
    parseItem(baseSnapshot({ contexts: [CONTEXT_UUID_1, CONTEXT_UUID_2] })),
    "parse item",
  );
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse updatedAt");
  const updated = item.setContexts([], updatedAt);
  assertEquals(updated.data.contexts, undefined);
  assert(updated.data.updatedAt.equals(updatedAt));
});

Deno.test("Item.setContexts clears contexts when undefined", () => {
  const item = unwrapOk(parseItem(baseSnapshot({ contexts: [CONTEXT_UUID_1] })), "parse item");
  const updatedAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse updatedAt");
  const updated = item.setContexts(undefined, updatedAt);
  assertEquals(updated.data.contexts, undefined);
  assert(updated.data.updatedAt.equals(updatedAt));
});

// Note: Legacy singular 'context' field migration is now handled at the repository layer,
// not in the pure domain model. See item_repository.ts for backward compatibility handling.

Deno.test("Item.snooze sets snoozeUntil", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const snoozeUntil = unwrapOk(parseDateTime("2024-09-21T18:00:00Z"), "parse snoozeUntil");
  const occurredAt = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse occurredAt");
  const snoozed = item.snooze(snoozeUntil, occurredAt);
  assert(snoozed.data.snoozeUntil?.equals(snoozeUntil));
  assert(snoozed.data.updatedAt.equals(occurredAt));
});

Deno.test("Item.snooze clears snoozeUntil when undefined", () => {
  const snapshot = baseSnapshot({ snoozeUntil: "2024-09-21T18:00:00Z" });
  const item = unwrapOk(parseItem(snapshot), "parse item");
  const occurredAt = unwrapOk(parseDateTime("2024-09-21T19:00:00Z"), "parse occurredAt");
  const unsnoozed = item.snooze(undefined, occurredAt);
  assertEquals(unsnoozed.data.snoozeUntil, undefined);
  assert(unsnoozed.data.updatedAt.equals(occurredAt));
});

Deno.test("Item.isSnoozing returns false when not snoozed", () => {
  const item = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const now = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse now");
  assertEquals(item.isSnoozing(now), false);
});

Deno.test("Item.isSnoozing returns true when snoozeUntil is in the future", () => {
  const snapshot = baseSnapshot({ snoozeUntil: "2024-09-21T18:00:00Z" });
  const item = unwrapOk(parseItem(snapshot), "parse item");
  const now = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse now");
  assertEquals(item.isSnoozing(now), true);
});

Deno.test("Item.isSnoozing returns false when snoozeUntil has passed", () => {
  const snapshot = baseSnapshot({ snoozeUntil: "2024-09-21T08:00:00Z" });
  const item = unwrapOk(parseItem(snapshot), "parse item");
  const now = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse now");
  assertEquals(item.isSnoozing(now), false);
});
