import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createWorkspaceScanner } from "./workspace_scanner.ts";
import { Result } from "../../shared/result.ts";
import {
  createAliasFile,
  createEdgeFile,
  createItemFile,
  createTestWorkspace,
} from "./fixtures/helpers.ts";

// Helper to collect all results from an async iterator
async function collectResults<T, E>(
  iterator: AsyncIterableIterator<Result<T, E>>,
): Promise<{ successes: T[]; errors: E[] }> {
  const successes: T[] = [];
  const errors: E[] = [];
  for await (const result of iterator) {
    if (result.type === "ok") {
      successes.push(result.value);
    } else {
      errors.push(result.error);
    }
  }
  return { successes, errors };
}

Deno.test("WorkspaceScanner", async (t) => {
  await t.step("scanAllItems - returns empty for empty workspace", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const scanner = createWorkspaceScanner(workspaceRoot);

      const { successes, errors } = await collectResults(scanner.scanAllItems());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 0);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllItems - scans valid items", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      // UUID v7 with timestamp for 2025-01-15 (use a valid UUID v7 format)
      const itemId = "019471a0-7b3a-7000-8000-000000000001";

      await createItemFile(workspaceRoot, itemId, { title: "Test Item" });

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllItems());

      // Log errors for debugging
      if (errors.length > 0) {
        console.log("Errors:", JSON.stringify(errors, null, 2));
      }

      assertEquals(errors.length, 0, `Expected no errors but got: ${JSON.stringify(errors)}`);
      assertEquals(successes.length, 1, `Expected 1 item but got ${successes.length}`);
      assertEquals(successes[0].data.id.toString(), itemId);
      assertEquals(successes[0].data.title.toString(), "Test Item");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllItems - yields error for invalid item", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);

      // Create an invalid item file (missing required fields)
      const invalidContent = [
        "---",
        "id: invalid-id",
        "---",
        "",
        "# Invalid Item",
      ].join("\n");
      const filePath = join(workspaceRoot, "items", "2025", "01", "15", "invalid.md");
      await Deno.writeTextFile(filePath, invalidContent);

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllItems());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 1);
      assertEquals(errors[0].kind, "parse_error");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllItems - continues after error (error tolerance)", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const validId = "019471a0-7b3a-7000-8000-000000000001";

      // Create one valid and one invalid item
      await createItemFile(workspaceRoot, validId, { title: "Valid Item" });

      const invalidContent = [
        "---",
        "id: not-a-uuid",
        "---",
        "",
        "# Invalid",
      ].join("\n");
      await Deno.writeTextFile(
        join(workspaceRoot, "items", "2025", "01", "15", "bad.md"),
        invalidContent,
      );

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllItems());

      // Should have collected both the valid item and the error
      assertEquals(successes.length, 1);
      assertEquals(errors.length, 1);
      assertEquals(successes[0].data.id.toString(), validId);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllEdges - returns empty for empty index", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const scanner = createWorkspaceScanner(workspaceRoot);

      const { successes, errors } = await collectResults(scanner.scanAllEdges());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 0);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllEdges - scans date edges", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const itemId = "019471a0-7b3a-7000-8000-000000000001";

      await createEdgeFile(workspaceRoot, "2025-01-15", itemId, "aaa");

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllEdges());

      assertEquals(errors.length, 0);
      assertEquals(successes.length, 1);
      assertEquals(successes[0].itemId.toString(), itemId);
      assertEquals(successes[0].rank.toString(), "aaa");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllEdges - yields error for invalid edge", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);

      // Create an invalid edge file
      const invalidEdge = { schema: "mm.edge/1", to: "not-a-uuid", rank: "aaa" };
      const edgeDir = join(workspaceRoot, ".index", "graph", "dates", "2025-01-15");
      await Deno.writeTextFile(
        join(edgeDir, "invalid.edge.json"),
        JSON.stringify(invalidEdge),
      );

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllEdges());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 1);
      assertEquals(errors[0].kind, "parse_error");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllAliases - returns empty for empty index", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const scanner = createWorkspaceScanner(workspaceRoot);

      const { successes, errors } = await collectResults(scanner.scanAllAliases());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 0);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllAliases - scans valid aliases", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);
      const itemId = "019471a0-7b3a-7000-8000-000000000001";

      await createAliasFile(workspaceRoot, "abc123", {
        raw: "MyAlias",
        canonicalKey: "myalias",
        itemId: itemId,
        createdAt: "2025-01-15T10:00:00Z",
      });

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllAliases());

      assertEquals(errors.length, 0);
      assertEquals(successes.length, 1);
      assertEquals(successes[0].data.slug.raw, "MyAlias");
      assertEquals(successes[0].data.itemId.toString(), itemId);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  await t.step("scanAllAliases - yields error for invalid alias", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceRoot = await createTestWorkspace(tempDir);

      // Create an invalid alias file
      const invalidAlias = {
        raw: "Valid",
        canonicalKey: "valid",
        itemId: "not-a-uuid",
        createdAt: "2025-01-15T10:00:00Z",
      };
      const aliasDir = join(workspaceRoot, ".index", "aliases", "ab");
      await Deno.writeTextFile(
        join(aliasDir, "abcd1234.alias.json"),
        JSON.stringify({ schema: "mm.alias/2", ...invalidAlias }),
      );

      const scanner = createWorkspaceScanner(workspaceRoot);
      const { successes, errors } = await collectResults(scanner.scanAllAliases());

      assertEquals(successes.length, 0);
      assertEquals(errors.length, 1);
      assertEquals(errors[0].kind, "parse_error");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  });
});
