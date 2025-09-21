import { parseContainer } from "./container.ts";
import { parseItem } from "./item.ts";
import { isContainerNode, isItemNode } from "./node.ts";

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

const makeItemSnapshot = (overrides: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: "019965a7-2789-740a-b8c1-1415904fd108",
  title: "Sample",
  icon: "note",
  status: "open",
  container: "2024/09/20",
  rank: "a",
  createdAt: "2024-09-20T12:00:00Z",
  updatedAt: "2024-09-20T12:00:00Z",
  ...overrides,
});

Deno.test("isContainerNode narrows containers", () => {
  const result = parseContainer({ path: "/", edges: [] });
  const node = unwrapOk(result, "parse container");

  assert(isContainerNode(node), "workspace root should be container");
  assertEquals(isItemNode(node), false);
  if (isContainerNode(node)) {
    assert(node.itemEdges().length === 0, "container edges should be accessible");
  }
});

Deno.test("isItemNode narrows items", () => {
  const result = parseItem(makeItemSnapshot());
  const node = unwrapOk(result, "parse item");

  assert(isItemNode(node), "item should satisfy item predicate");
  assertEquals(isContainerNode(node), false);
  if (isItemNode(node)) {
    assert(node.data.id.toString().length > 0, "item data should be accessible");
  }
});
