import { parseItem } from "./item.ts";
import {
  parseAliasSlug,
  parseContainerPath,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemRank,
  parseItemTitle,
  parseTagSlug,
} from "../primitives/mod.ts";

type ItemSnapshot = Parameters<typeof parseItem>[0];

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
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

const baseSnapshot = (overrides: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Test item",
  icon: "note",
  status: "open",
  container: "2024/09/20",
  rank: "a",
  createdAt: "2024-09-20T12:00:00Z",
  updatedAt: "2024-09-20T12:00:00Z",
  context: "work",
  ...overrides,
});

Deno.test("parseItem parses full snapshot payload", () => {
  const snapshot = baseSnapshot({
    title: "Detailed item",
    icon: "task",
    status: "closed",
    container: "project-alpha",
    rank: "b1",
    alias: "focus-work",
    context: "deep-work",
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
  assertEquals(item.data.container.toString(), "project-alpha");
  assertEquals(item.data.rank.toString(), "b1");
  assertEquals(item.data.alias?.toString(), "focus-work");
  assertEquals(item.data.context?.toString(), "deep-work");
  assertEquals(item.data.body, "Example body");
  assertEquals(item.data.closedAt?.toString(), "2024-09-21T06:00:00.000Z");
  assertEquals(item.data.startAt?.toString(), "2024-09-22T08:00:00.000Z");
  assertEquals(item.data.duration?.toMinutes(), 90);
  assertEquals(item.data.dueAt?.toString(), "2024-09-22T10:00:00.000Z");
  assertEquals(item.data.createdAt.toString(), "2024-09-20T08:00:00.000Z");
  assertEquals(item.data.updatedAt.toString(), "2024-09-21T14:00:00.000Z");
  assertEquals(item.edges.length, 0);
  assertEquals(item.itemEdges().length, 0);
  assertEquals(item.containerEdges().length, 0);
  assertEquals(item.path.toString(), item.data.id.toString());
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
        {
          kind: "ContainerEdge",
          to: "projects/focus",
          index: 1,
        },
      ],
    }),
  );

  const item = unwrapOk(result, "parse item with edges");
  assertEquals(item.edges.length, 2);
  assertEquals(item.edges[0].kind, "ItemEdge");
  assertEquals(item.edges[1].kind, "ContainerEdge");
  assertEquals(item.itemEdges().length, 1);
  assertEquals(item.containerEdges().length, 1);

  const roundTrip = item.toJSON();
  assert(roundTrip.edges !== undefined, "edges should be serialized");
  assertEquals(roundTrip.edges?.length, 2);
});

Deno.test("setContext updates and normalizes context tag", () => {
  const parseResult = parseItem(baseSnapshot());
  if (parseResult.type !== "ok") {
    throw new Error(`expected ok result, got error: ${parseResult.error.toString()}`);
  }
  const item = parseResult.value;

  const focusContextResult = parseTagSlug("focus");
  if (focusContextResult.type !== "ok") {
    throw new Error("failed to parse focus context tag");
  }
  const updatedAtResult = parseDateTime("2024-09-21T09:00:00Z");
  if (updatedAtResult.type !== "ok") {
    throw new Error("failed to parse updatedAt timestamp");
  }

  const updated = item.setContext(focusContextResult.value, updatedAtResult.value);
  assertEquals(updated.data.context?.toString(), "focus");
  assert(updated.data.updatedAt.equals(updatedAtResult.value), "updatedAt should update");
  assertEquals(item.data.context?.toString(), "work", "original item should be unchanged");

  const repeat = updated.setContext(focusContextResult.value, updatedAtResult.value);
  assertEquals(repeat, updated, "setting same context should return same instance");

  const clearedAtResult = parseDateTime("2024-09-22T10:30:00Z");
  if (clearedAtResult.type !== "ok") {
    throw new Error("failed to parse clearedAt timestamp");
  }

  const cleared = updated.setContext(undefined, clearedAtResult.value);
  assertEquals(cleared.data.context, undefined);
  assert(
    cleared.data.updatedAt.equals(clearedAtResult.value),
    "cleared item should have new updatedAt",
  );
});

Deno.test("parseItem rejects invalid context tag", () => {
  const result = parseItem(baseSnapshot({ context: "Invalid Context!" }));
  if (result.type !== "error") {
    throw new Error("expected parse failure for invalid context");
  }
  assert(
    result.error.issues.every((issue) => issue.path[0] === "context"),
    "context validation issues should be scoped to context field",
  );
  const codes = result.error.issues.map((issue) => issue.code);
  assert(codes.includes("format"), "expected format issue for invalid characters");
  assert(codes.includes("whitespace"), "expected whitespace issue for spaces");
});

Deno.test("parseItem aggregates validation issues", () => {
  const snapshot = baseSnapshot({
    id: "not-a-uuid",
    icon: "unknown",
    rank: "#invalid",
    updatedAt: "invalid-date",
  });

  const result = parseItem(snapshot);
  if (result.type !== "error") {
    throw new Error("expected parse failure for invalid snapshot");
  }

  const codes = result.error.issues.map((issue) => issue.code).sort();
  assert(codes.length >= 4, "expected multiple issues");
  assert(codes.includes("format"), "should include format error");
  assert(codes.includes("invalid_value"), "should include invalid value error");
  assert(
    codes.includes("invalid_datetime") || codes.includes("format"),
    "should include datetime error",
  );

  const paths = result.error.issues.map((issue) => issue.path.join("."));
  assert(paths.some((path) => path === "id.value"), "id issues expected");
  assert(paths.some((path) => path === "icon.value"), "icon issues expected");
  assert(paths.some((path) => path === "rank.value"), "rank issues expected");
  assert(paths.some((path) => path === "updatedAt.iso"), "updatedAt issues expected");
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

Deno.test("Item.relocate updates container and rank", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const targetContainer = unwrapOk(parseContainerPath("project-alpha"), "parse container");
  const targetRank = unwrapOk(parseItemRank("b1"), "parse rank");
  const relocateAt = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse relocate timestamp");

  const relocated = base.relocate(targetContainer, targetRank, relocateAt);
  assertEquals(relocated.data.container.toString(), "project-alpha");
  assertEquals(relocated.data.rank.toString(), "b1");
  assert(relocated.data.updatedAt.equals(relocateAt), "updatedAt should match relocate timestamp");
  assertEquals(base.data.container.toString(), "2024/09/20");
});

Deno.test("Item.retitle updates title when changed", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const newTitle = unwrapOk(parseItemTitle("Updated item"), "parse title");
  const retitleAt = unwrapOk(parseDateTime("2024-09-21T11:00:00Z"), "parse retitle timestamp");

  const retitled = base.retitle(newTitle, retitleAt);
  assertEquals(retitled.data.title.toString(), "Updated item");
  assert(retitled.data.updatedAt.equals(retitleAt), "updatedAt should match retitle timestamp");
  assertEquals(base.data.title.toString(), "Test item");
});

Deno.test("Item.changeIcon persists new icon", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const newIcon = unwrapOk(parseItemIcon("task"), "parse icon");
  const iconAt = unwrapOk(parseDateTime("2024-09-21T11:30:00Z"), "parse icon timestamp");

  const updated = base.changeIcon(newIcon, iconAt);
  assertEquals(updated.data.icon.toString(), "task");
  assert(updated.data.updatedAt.equals(iconAt), "updatedAt should match icon timestamp");
  assertEquals(base.data.icon.toString(), "note");
});

Deno.test("Item.setBody trims whitespace and updates timestamp", () => {
  const base = unwrapOk(parseItem(baseSnapshot({ body: undefined })), "parse item");
  const bodyAt = unwrapOk(parseDateTime("2024-09-21T12:00:00Z"), "parse body timestamp");

  const updated = base.setBody("  Updated body  ", bodyAt);
  assertEquals(updated.data.body, "Updated body");
  assert(updated.data.updatedAt.equals(bodyAt), "updatedAt should match body timestamp");
  assertEquals(base.data.body, undefined);
});

Deno.test("Item.schedule overwrites scheduling fields", () => {
  const base = unwrapOk(
    parseItem(baseSnapshot({
      startAt: undefined,
      dueAt: undefined,
    })),
    "parse item",
  );

  const startAt = unwrapOk(parseDateTime("2024-09-22T08:00:00Z"), "parse startAt");
  const dueAt = unwrapOk(parseDateTime("2024-09-22T10:00:00Z"), "parse dueAt");
  const duration = unwrapOk(parseDuration("1h30m"), "parse duration");
  const scheduleAt = unwrapOk(parseDateTime("2024-09-21T12:30:00Z"), "parse schedule timestamp");

  const scheduled = base.schedule({ startAt, dueAt, duration }, scheduleAt);
  assert(scheduled.data.startAt?.equals(startAt), "startAt should match");
  assertEquals(scheduled.data.duration?.toMinutes(), 90);
  assert(scheduled.data.dueAt?.equals(dueAt), "dueAt should match");
  assert(scheduled.data.updatedAt.equals(scheduleAt), "updatedAt should match schedule timestamp");
});

Deno.test("Item.setAlias stores alias when changed", () => {
  const base = unwrapOk(parseItem(baseSnapshot({ alias: undefined })), "parse item");
  const alias = unwrapOk(parseAliasSlug("deep-focus"), "parse alias");
  const aliasAt = unwrapOk(parseDateTime("2024-09-21T13:00:00Z"), "parse alias timestamp");

  const withAlias = base.setAlias(alias, aliasAt);
  assertEquals(withAlias.data.alias?.toString(), "deep-focus");
  assert(withAlias.data.updatedAt.equals(aliasAt), "updatedAt should match alias timestamp");
  assertEquals(base.data.alias, undefined);
});

Deno.test("Item.toJSON reflects current data", () => {
  const base = unwrapOk(
    parseItem(baseSnapshot({
      context: undefined,
      alias: "focus-work",
      body: "Initial body",
      startAt: undefined,
      dueAt: undefined,
    })),
    "parse item",
  );

  const closedAt = unwrapOk(parseDateTime("2024-09-21T06:00:00Z"), "parse closedAt");
  const reopenedAt = unwrapOk(parseDateTime("2024-09-21T09:00:00Z"), "parse reopenedAt");
  const relocateAt = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse relocate timestamp");
  const retitleAt = unwrapOk(parseDateTime("2024-09-21T11:00:00Z"), "parse retitle timestamp");
  const iconAt = unwrapOk(parseDateTime("2024-09-21T11:30:00Z"), "parse icon timestamp");
  const bodyAt = unwrapOk(parseDateTime("2024-09-21T12:00:00Z"), "parse body timestamp");
  const scheduleAt = unwrapOk(parseDateTime("2024-09-21T12:30:00Z"), "parse schedule timestamp");
  const aliasAt = unwrapOk(parseDateTime("2024-09-21T13:00:00Z"), "parse alias timestamp");
  const contextAt = unwrapOk(parseDateTime("2024-09-21T14:00:00Z"), "parse context timestamp");

  const closed = base.close(closedAt);
  const reopened = closed.reopen(reopenedAt);

  const targetContainer = unwrapOk(parseContainerPath("project-alpha"), "parse container");
  const targetRank = unwrapOk(parseItemRank("b1"), "parse rank");
  const relocated = reopened.relocate(targetContainer, targetRank, relocateAt);

  const newTitle = unwrapOk(parseItemTitle("Updated item"), "parse title");
  const retitled = relocated.retitle(newTitle, retitleAt);

  const newIcon = unwrapOk(parseItemIcon("task"), "parse icon");
  const reiconed = retitled.changeIcon(newIcon, iconAt);

  const withBody = reiconed.setBody("  Updated body  ", bodyAt);

  const startAt = unwrapOk(parseDateTime("2024-09-22T08:00:00Z"), "parse startAt");
  const dueAt = unwrapOk(parseDateTime("2024-09-22T10:00:00Z"), "parse dueAt");
  const duration = unwrapOk(parseDuration("1h30m"), "parse duration");
  const scheduled = withBody.schedule({ startAt, dueAt, duration }, scheduleAt);

  const alias = unwrapOk(parseAliasSlug("deep-focus"), "parse alias");
  const withAlias = scheduled.setAlias(alias, aliasAt);

  const finalContext = unwrapOk(parseTagSlug("deep-work"), "parse context");
  const finalNode = withAlias.setContext(finalContext, contextAt);

  const snapshot = finalNode.toJSON();
  assertEquals(snapshot.id, "019965a7-2789-740a-b8c1-1415904fd108");
  assertEquals(snapshot.title, "Updated item");
  assertEquals(snapshot.icon, "task");
  assertEquals(snapshot.status, "open");
  assertEquals(snapshot.container, "project-alpha");
  assertEquals(snapshot.rank, "b1");
  assertEquals(snapshot.alias, "deep-focus");
  assertEquals(snapshot.context, "deep-work");
  assertEquals(snapshot.body, "Updated body");
  assertEquals(snapshot.closedAt, undefined);
  assertEquals(snapshot.duration, "1h30m");
  assertEquals(snapshot.startAt, "2024-09-22T08:00:00.000Z");
  assertEquals(snapshot.dueAt, "2024-09-22T10:00:00.000Z");
});
