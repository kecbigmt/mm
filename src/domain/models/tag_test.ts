import { Result } from "../../shared/result.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { tagSlugFromString } from "../primitives/tag_slug.ts";
import { createTag, parseTag } from "./tag.ts";

const assertEquals = <T>(actual: T, expected: T, message?: string): void => {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${expected} but received ${actual}`);
  }
};

const expectOk = <T, E>(result: Result<T, E>): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("parseTag returns Tag for valid snapshot", () => {
  const result = parseTag({
    rawAlias: "github",
    canonicalAlias: "github",
    createdAt: "2024-03-15T12:34:56.000Z",
    description: "Issues and PRs",
  });

  const tag = expectOk(result);
  assertEquals(tag.kind, "Tag");
  assertEquals(tag.data.alias.toString(), "github");
  assertEquals(tag.data.alias.canonicalKey.toString(), "github");
  assertEquals(tag.data.createdAt.toString(), "2024-03-15T12:34:56.000Z");
  assertEquals(tag.data.description, "Issues and PRs");

  const snapshot = tag.toJSON();
  assertEquals(snapshot.rawAlias, "github");
  assertEquals(snapshot.canonicalAlias, "github");
  assertEquals(snapshot.createdAt, "2024-03-15T12:34:56.000Z");
  assertEquals(snapshot.description, "Issues and PRs");
});

Deno.test("parseTag rejects invalid fields", () => {
  const result = parseTag({
    rawAlias: " ",
    canonicalAlias: 123 as unknown as string,
    createdAt: 42 as unknown as string,
    description: 123 as unknown as string,
  });

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  const paths = result.error.issues.map((issue) => issue.path[0]);
  assertEquals(paths.includes("rawAlias"), true);
  assertEquals(paths.includes("canonicalAlias"), true);
  assertEquals(paths.includes("createdAt"), true);
  assertEquals(paths.includes("description"), true);
});

Deno.test("createTag normalizes description", () => {
  const alias = expectOk(tagSlugFromString("focus"));
  const createdAt = expectOk(parseDateTime("2024-03-15T12:34:56.000Z"));

  const tag = createTag({ alias, createdAt, description: "  " + "" });
  assertEquals(tag.data.description, undefined);
});
