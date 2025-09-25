import { createItem, parseItem } from "./item.ts";
import {
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemId,
  parseItemRank,
  parseItemTitle,
  parseSectionPath,
  parseTagSlug,
} from "../primitives/mod.ts";
import { createItemPlacement } from "./placement.ts";
import { parseSectionTree, type SectionTreeSnapshot } from "./section_tree.ts";

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

const baseSnapshot = (
  overrides: Partial<Parameters<typeof parseItem>[0]> = {},
): Parameters<typeof parseItem>[0] => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Test item",
  icon: "note",
  status: "open",
  placement: {
    kind: "root",
    section: ":2024-09-20",
    rank: "a",
  },
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
    placement: {
      kind: "root",
      section: ":2024-09-21",
      rank: "b1",
    },
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
  assertEquals(item.data.placement.rank.toString(), "b1");
  assertEquals(item.data.placement.section()?.toString(), ":2024-09-21");
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
  assert(item.sections().isEmpty(), "section tree should be empty");
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
  assert(item.sections().isEmpty(), "section tree should be empty when sections are absent");

  const roundTrip = item.toJSON();
  assert(roundTrip.edges !== undefined, "edges should be serialized");
  assertEquals(roundTrip.edges?.length, 1);
  assert(roundTrip.placement !== undefined, "placement should be serialized");
});

Deno.test("parseItem parses section tree snapshot", () => {
  const sections: SectionTreeSnapshot = [
    {
      section: ":2024-09-21",
      edges: [{
        kind: "ItemEdge",
        to: "019965a7-2789-740a-b8c1-1415904fd209",
        rank: "a",
      }],
    },
  ];

  const result = parseItem(baseSnapshot({ sections }));
  const item = unwrapOk(result, "parse item with sections");

  const sectionPath = unwrapOk(parseSectionPath(":2024-09-21"), "parse section path");
  const node = item.sections().findSection(sectionPath);
  assert(node, "expected section node to be present");
  assertEquals(node?.edges.length ?? 0, 1);

  const snapshot = item.toJSON();
  assert(snapshot.sections !== undefined, "sections should be serialized");
  assertEquals(snapshot.sections?.length, 1);
});

Deno.test("parseItem requires placement metadata", () => {
  const { placement: _placement, ...legacySnapshot } = baseSnapshot();
  const result = parseItem(legacySnapshot as unknown as Parameters<typeof parseItem>[0]);
  if (result.type !== "error") {
    throw new Error("expected placement validation error");
  }
  assert(
    result.error.issues.some((issue) => issue.path[0] === "placement"),
    "placement issues should be reported",
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

Deno.test("Item.relocate updates placement", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse item");
  const targetRank = unwrapOk(parseItemRank("b1"), "parse rank");
  const targetSection = unwrapOk(parseSectionPath(":1"), "parse section");
  const parent = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd109"), "parse parent id");
  const placement = createItemPlacement(parent, targetSection, targetRank);
  const relocateAt = unwrapOk(parseDateTime("2024-09-21T10:00:00Z"), "parse relocate timestamp");

  const relocated = base.relocate(placement, relocateAt);
  assertEquals(relocated.data.placement.rank.toString(), "b1");
  assertEquals(relocated.data.placement.section()?.toString(), ":1");
  assert(relocated.data.updatedAt.equals(relocateAt), "updatedAt should match relocate timestamp");
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

  const targetRank = unwrapOk(parseItemRank("b1"), "parse rank");
  const targetSection = unwrapOk(parseSectionPath(":1"), "parse section");
  const parent = unwrapOk(parseItemId("019965a7-2789-740a-b8c1-1415904fd200"), "parse parent id");
  const placement = createItemPlacement(parent, targetSection, targetRank);
  const relocated = reopened.relocate(placement, relocateAt);

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
  assertEquals(snapshot.placement.rank, "b1");
  assertEquals(snapshot.placement.section, ":1");
  assertEquals(snapshot.alias, "deep-focus");
  assertEquals(snapshot.context, "deep-work");
  assertEquals(snapshot.body, "Updated body");
  assertEquals(snapshot.closedAt, undefined);
  assertEquals(snapshot.duration, "1h30m");
  assertEquals(snapshot.startAt, "2024-09-22T08:00:00.000Z");
  assertEquals(snapshot.dueAt, "2024-09-22T10:00:00.000Z");
  assertEquals(snapshot.sections, undefined);
});

Deno.test("createItem accepts explicit section tree", () => {
  const base = unwrapOk(parseItem(baseSnapshot()), "parse base item");
  const treeSnapshot: SectionTreeSnapshot = [
    {
      section: ":2024-09-22",
      edges: [{
        kind: "ItemEdge",
        to: "019965a7-2789-740a-b8c1-1415904fd309",
        rank: "b",
      }],
    },
  ];
  const tree = unwrapOk(parseSectionTree(treeSnapshot), "parse section tree");

  const item = createItem(base.data, { sectionTree: tree });
  assert(!item.sections().isEmpty(), "section tree should be preserved on creation");

  const snapshot = item.toJSON();
  assert(snapshot.sections !== undefined, "sections should be serialized");
  assertEquals(snapshot.sections?.length, 1);
});
