import { assertEquals, assertRejects } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { createFileSystemAliasRepository } from "./alias_repository.ts";
import { parseAlias } from "../../domain/models/alias.ts";
import { aliasSlugFromString } from "../../domain/primitives/mod.ts";

const unwrapOk = <T, E>(
  result: { type: "ok"; value: T } | { type: "error"; error: E },
  context: string,
): T => {
  if (result.type !== "ok") {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const sampleAlias = () =>
  unwrapOk(
    parseAlias({
      slug: "focus-work",
      itemId: "019965a7-2789-740a-b8c1-1415904fd108",
      createdAt: "2024-09-20T12:00:00Z",
    }),
    "parse alias",
  );

Deno.test({
  name: "alias repository saves and loads aliases",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-alias-" });
    try {
      const repository = createFileSystemAliasRepository({ root });
      const alias = sampleAlias();

      const saveResult = await repository.save(alias);
      unwrapOk(saveResult, "save alias");

      const loadResult = await repository.load(alias.data.slug);
      const loadedOption = unwrapOk(loadResult, "load alias");
      if (!loadedOption) {
        throw new Error("expected alias to be returned");
      }
      const loaded = loadedOption;

      assertEquals(loaded.data.slug.toString(), alias.data.slug.toString());
      assertEquals(loaded.data.itemId.toString(), alias.data.itemId.toString());

      const aliasFile = join(root, "aliases", "focus-work.alias.json");
      const persisted = JSON.parse(await Deno.readTextFile(aliasFile));
      assertEquals(persisted.schema, "mm.alias/1");
      assertEquals(persisted.slug, "focus-work");
      assertEquals(persisted.itemId, alias.data.itemId.toString());

      const dirEntries: string[] = [];
      for await (const entry of Deno.readDir(join(root, "aliases"))) {
        if (entry.isFile) {
          dirEntries.push(entry.name);
        }
      }
      dirEntries.sort();
      assertEquals(dirEntries, ["focus-work.alias.json"]);

      const listResult = await repository.list();
      const aliases = unwrapOk(listResult, "list aliases");
      assertEquals(aliases.length, 1);
      assertEquals(aliases[0].data.slug.toString(), alias.data.slug.toString());
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "alias repository deletes aliases",
  permissions: { read: true, write: true },
  async fn() {
    const root = await Deno.makeTempDir({ prefix: "mm-alias-delete-" });
    try {
      const repository = createFileSystemAliasRepository({ root });
      const alias = sampleAlias();
      unwrapOk(await repository.save(alias), "save alias");

      const deleteResult = await repository.delete(alias.data.slug);
      unwrapOk(deleteResult, "delete alias");

      const aliasFile = join(root, "aliases", "focus-work.alias.json");
      await assertRejects(() => Deno.stat(aliasFile), Deno.errors.NotFound);

      const loadResult = await repository.load(alias.data.slug);
      if (loadResult.type !== "ok" || loadResult.value !== undefined) {
        throw new Error("expected alias to be removed");
      }

      const slug = unwrapOk(aliasSlugFromString("missing"), "create slug");
      const missingResult = await repository.load(slug);
      if (missingResult.type !== "ok" || missingResult.value !== undefined) {
        throw new Error("expected missing alias lookup to return undefined");
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
