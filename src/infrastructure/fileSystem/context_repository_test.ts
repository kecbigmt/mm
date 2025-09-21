import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemContextRepository } from "./context_repository.ts";
import { parseContext } from "../../domain/models/context.ts";
import { contextTagFromString } from "../../domain/primitives/mod.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const unwrapError = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): E => {
  if (result.type !== "error") {
    throw new Error(`${context}: expected error`);
  }
  return result.error;
};

const sampleContext = () =>
  unwrapOk(
    parseContext({
      tag: "deep-work",
      createdAt: "2024-09-20T09:00:00Z",
      description: "Deep work focus",
    }),
    "parse context",
  );

Deno.test({
  name: "context repository saves and loads contexts",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-context-" });
    try {
      const repository = createFileSystemContextRepository({ root });
      const context = sampleContext();

      const saveResult = await repository.save(context);
      unwrapOk(saveResult, "save context");

      const loadResult = await repository.load(context.data.tag);
      const loadedOption = unwrapOk(loadResult, "load context");
      if (!loadedOption) {
        throw new Error("expected context to be returned");
      }
      const loaded = loadedOption;

      assertEquals(loaded.data.tag.toString(), context.data.tag.toString());
      assertEquals(loaded.data.description, context.data.description);

      const contextFile = join(root, "contexts", "deep-work.context.json");
      const persisted = JSON.parse(await Deno.readTextFile(contextFile));
      assertEquals(persisted.schema, "mm.context/1");
      assertEquals(persisted.tag, "deep-work");
      assertEquals(persisted.description, "Deep work focus");

      const dirEntries: string[] = [];
      for await (const entry of Deno.readDir(join(root, "contexts"))) {
        if (entry.isFile) {
          dirEntries.push(entry.name);
        }
      }
      dirEntries.sort();
      assertEquals(dirEntries, ["deep-work.context.json"]);

      const listResult = await repository.list();
      const contexts = unwrapOk(listResult, "list contexts");
      assertEquals(contexts.length, 1);
      assertEquals(contexts[0].data.tag.toString(), context.data.tag.toString());
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "context repository deletes contexts",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-context-delete-" });
    try {
      const repository = createFileSystemContextRepository({ root });
      const context = sampleContext();
      unwrapOk(await repository.save(context), "save context");

      const deleteResult = await repository.delete(context.data.tag);
      unwrapOk(deleteResult, "delete context");

      const contextFile = join(root, "contexts", "deep-work.context.json");
      await assertRejects(() => Deno.stat(contextFile), Deno.errors.NotFound);

      const loadResult = await repository.load(context.data.tag);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected context to be removed");
      }

      const missingTag = unwrapOk(contextTagFromString("missing"), "create context tag");
      const missingResult = await repository.load(missingTag);
      if (missingResult.type !== "ok" || missingResult.value !== undefined) {
        throw new Error("expected missing context lookup to return undefined");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "context repository load fails when JSON is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-context-invalid-json-" });
    try {
      const repository = createFileSystemContextRepository({ root });
      const tag = unwrapOk(contextTagFromString("broken"), "create context tag");
      const filePath = join(root, "contexts", "broken.context.json");
      await Deno.mkdir(join(root, "contexts"), { recursive: true });
      await Deno.writeTextFile(filePath, "{ invalid");

      const loadResult = await repository.load(tag);
      const error = unwrapError(loadResult, "load context error");

      assertEquals(error.scope, "context");
      assertEquals(error.operation, "load");
      assertEquals(error.identifier, "broken");
      assertEquals(error.message, "context file contains invalid JSON");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "context repository load fails when snapshot is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-context-invalid-snapshot-" });
    try {
      const repository = createFileSystemContextRepository({ root });
      const tag = unwrapOk(contextTagFromString("deep-work"), "create context tag");
      const filePath = join(root, "contexts", "deep-work.context.json");
      await Deno.mkdir(join(root, "contexts"), { recursive: true });
      await Deno.writeTextFile(
        filePath,
        JSON.stringify({
          tag: "deep-work",
          createdAt: "invalid-date",
          description: "Deep work focus",
        }),
      );

      const loadResult = await repository.load(tag);
      const error = unwrapError(loadResult, "load context error");

      assertEquals(error.scope, "context");
      assertEquals(error.operation, "load");
      assertEquals(error.identifier, "deep-work");
      assertEquals(error.message, "context data is invalid");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "context repository list fails when any snapshot is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-context-list-invalid-" });
    try {
      const repository = createFileSystemContextRepository({ root });
      await Deno.mkdir(join(root, "contexts"), { recursive: true });
      await Deno.writeTextFile(
        join(root, "contexts", "deep-work.context.json"),
        JSON.stringify({
          tag: "deep-work",
          createdAt: "invalid-date",
        }),
      );

      const listResult = await repository.list();
      const error = unwrapError(listResult, "list contexts error");

      assertEquals(error.scope, "context");
      assertEquals(error.operation, "list");
      assertEquals(error.message, "context data is invalid");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
