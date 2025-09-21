import { Result } from "../../shared/result.ts";
import { contextTagFromString } from "../primitives/context_tag.ts";
import { parseDateTime } from "../primitives/date_time.ts";
import { createContext, parseContext } from "./context.ts";

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

Deno.test("parseContext returns Context for valid snapshot", () => {
  const result = parseContext({
    tag: "github",
    createdAt: "2024-03-15T12:34:56.000Z",
    description: "Issues and PRs",
  });

  const context = expectOk(result);
  assertEquals(context.kind, "Context");
  assertEquals(context.data.tag.toString(), "github");
  assertEquals(context.data.createdAt.toString(), "2024-03-15T12:34:56.000Z");
  assertEquals(context.data.description, "Issues and PRs");

  const snapshot = context.toJSON();
  assertEquals(snapshot.tag, "github");
  assertEquals(snapshot.createdAt, "2024-03-15T12:34:56.000Z");
  assertEquals(snapshot.description, "Issues and PRs");
});

Deno.test("parseContext rejects invalid fields", () => {
  const result = parseContext({
    tag: "",
    createdAt: 42 as unknown as string,
    description: 123 as unknown as string,
  });

  if (result.type !== "error") {
    throw new Error("expected error result");
  }

  assertEquals(result.error.issues.length, 3);
  assertEquals(result.error.issues[0].path[0], "tag");
  assertEquals(result.error.issues[1].path[0], "createdAt");
  assertEquals(result.error.issues[2].path[0], "description");
});

Deno.test("createContext normalizes description", () => {
  const tag = expectOk(contextTagFromString("focus"));
  const createdAt = expectOk(parseDateTime("2024-03-15T12:34:56.000Z"));

  const context = createContext({ tag, createdAt, description: "  " + "" });
  assertEquals(context.data.description, undefined);
});
