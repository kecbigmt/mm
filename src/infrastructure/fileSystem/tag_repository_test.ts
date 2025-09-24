import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createFileSystemTagRepository } from "./tag_repository.ts";
import { createTag, parseTag } from "../../domain/models/tag.ts";
import { tagSlugFromString } from "../../domain/primitives/mod.ts";
import { createSha256HashingService } from "../hash/sha256_hashing_service.ts";

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

const sampleTag = () =>
  unwrapOk(
    parseTag({
      rawAlias: "deep-work",
      canonicalAlias: "deep-work",
      createdAt: "2024-09-20T09:00:00Z",
      description: "Deep work focus",
    }),
    "parse tag",
  );

Deno.test({
  name: "tag repository saves and loads tags",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-tag-" });
    try {
      const hashingService = createSha256HashingService();
      const repository = createFileSystemTagRepository({ root, hashingService });
      const tag = sampleTag();

      const saveResult = await repository.save(tag);
      unwrapOk(saveResult, "save tag");

      const loadResult = await repository.load(tag.data.alias);
      const loadedOption = unwrapOk(loadResult, "load tag");
      if (!loadedOption) {
        throw new Error("expected tag to be returned");
      }
      const loaded = loadedOption;

      assertEquals(loaded.data.alias.toString(), tag.data.alias.toString());
      assertEquals(loaded.data.description, tag.data.description);

      const hashResult = await hashingService.hash(tag.data.alias.canonicalKey.toString());
      const hash = unwrapOk(hashResult, "hash tag");
      const tagFile = join(root, "tags", `${hash}.tag.json`);
      const persisted = JSON.parse(await Deno.readTextFile(tagFile));
      assertEquals(persisted.schema, "mm.tag/1");
      assertEquals(persisted.rawAlias, "deep-work");
      assertEquals(persisted.canonicalAlias, "deep-work");
      assertEquals(persisted.description, "Deep work focus");

      const dirEntries: string[] = [];
      for await (const entry of Deno.readDir(join(root, "tags"))) {
        if (entry.isFile) {
          dirEntries.push(entry.name);
        }
      }
      dirEntries.sort();
      assertEquals(dirEntries, [`${hash}.tag.json`]);

      const listResult = await repository.list();
      const tags = unwrapOk(listResult, "list tags");
      assertEquals(tags.length, 1);
      assertEquals(tags[0].data.alias.toString(), tag.data.alias.toString());
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "tag repository deletes tags",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-tag-delete-" });
    try {
      const hashingService = createSha256HashingService();
      const repository = createFileSystemTagRepository({ root, hashingService });
      const tag = sampleTag();
      unwrapOk(await repository.save(tag), "save tag");

      const deleteResult = await repository.delete(tag.data.alias);
      unwrapOk(deleteResult, "delete tag");

      const hashResult = await hashingService.hash(tag.data.alias.canonicalKey.toString());
      const hash = unwrapOk(hashResult, "hash tag");
      const tagFile = join(root, "tags", `${hash}.tag.json`);
      await assertRejects(() => Deno.stat(tagFile), Deno.errors.NotFound);

      const loadResult = await repository.load(tag.data.alias);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected tag to be removed");
      }

      const missingAlias = unwrapOk(tagSlugFromString("missing"), "create tag alias");
      const missingResult = await repository.load(missingAlias);
      if (missingResult.type !== "ok" || missingResult.value !== undefined) {
        throw new Error("expected missing tag lookup to return undefined");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "tag repository load fails when JSON is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-tag-invalid-json-" });
    try {
      const hashingService = createSha256HashingService();
      const repository = createFileSystemTagRepository({ root, hashingService });
      const alias = unwrapOk(tagSlugFromString("broken"), "create tag alias");
      const hashResult = await hashingService.hash(alias.canonicalKey.toString());
      const hash = unwrapOk(hashResult, "hash tag");
      const filePath = join(root, "tags", `${hash}.tag.json`);
      await Deno.mkdir(join(root, "tags"), { recursive: true });
      await Deno.writeTextFile(filePath, "{ invalid");

      const loadResult = await repository.load(alias);
      const error = unwrapError(loadResult, "load tag error");

      assertEquals(error.scope, "tag");
      assertEquals(error.operation, "load");
      assertEquals(error.identifier, "broken");
      assertEquals(error.message, "tag file contains invalid JSON");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "tag repository load fails when snapshot is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-tag-invalid-snapshot-" });
    try {
      const hashingService = createSha256HashingService();
      const repository = createFileSystemTagRepository({ root, hashingService });
      const alias = unwrapOk(tagSlugFromString("deep-work"), "create tag alias");
      const hashResult = await hashingService.hash(alias.canonicalKey.toString());
      const hash = unwrapOk(hashResult, "hash tag");
      const filePath = join(root, "tags", `${hash}.tag.json`);
      await Deno.mkdir(join(root, "tags"), { recursive: true });
      await Deno.writeTextFile(
        filePath,
        JSON.stringify({
          rawAlias: "deep-work",
          canonicalAlias: "deep-work",
          createdAt: "invalid-date",
          description: "Deep work focus",
        }),
      );

      const loadResult = await repository.load(alias);
      const error = unwrapError(loadResult, "load tag error");

      assertEquals(error.scope, "tag");
      assertEquals(error.operation, "load");
      assertEquals(error.identifier, "deep-work");
      assertEquals(error.message, "tag data is invalid");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "tag repository list fails when any snapshot is invalid",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-tag-list-invalid-" });
    try {
      const hashingService = createSha256HashingService();
      const repository = createFileSystemTagRepository({ root, hashingService });
      await Deno.mkdir(join(root, "tags"), { recursive: true });
      const hashResult = await hashingService.hash("deep-work");
      const hash = unwrapOk(hashResult, "hash tag");
      await Deno.writeTextFile(
        join(root, "tags", `${hash}.tag.json`),
        JSON.stringify({
          rawAlias: "deep-work",
          canonicalAlias: "deep-work",
          createdAt: "invalid-date",
        }),
      );

      const listResult = await repository.list();
      const error = unwrapError(listResult, "list tags error");

      assertEquals(error.scope, "tag");
      assertEquals(error.operation, "list");
      assertEquals(error.message, "tag data is invalid");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
