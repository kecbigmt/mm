import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createFileSessionRepository } from "./session_repository.ts";

Deno.test("FileSessionRepository", async (t) => {
  const testBaseDir = await Deno.makeTempDir({ prefix: "mm-session-test-" });

  await t.step("load returns null when session file does not exist", async () => {
    const repo = createFileSessionRepository({
      uid: 1000,
      ppid: 12345,
      baseDir: testBaseDir,
    });

    const result = await repo.load();
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value, null);
    }
  });

  await t.step("save and load round-trip", async () => {
    const repo = createFileSessionRepository({
      uid: 1000,
      ppid: 12346,
      baseDir: testBaseDir,
    });

    const sessionData = {
      workspace: "/path/to/workspace",
      cwd: "2026-01-19",
    };

    const saveResult = await repo.save(sessionData);
    assertEquals(saveResult.type, "ok");

    const loadResult = await repo.load();
    assertEquals(loadResult.type, "ok");
    if (loadResult.type === "ok") {
      assertEquals(loadResult.value, sessionData);
    }
  });

  await t.step("save overwrites existing session", async () => {
    const repo = createFileSessionRepository({
      uid: 1000,
      ppid: 12347,
      baseDir: testBaseDir,
    });

    await repo.save({ workspace: "/workspace1", cwd: "2026-01-01" });
    await repo.save({ workspace: "/workspace2", cwd: "permanent" });

    const loadResult = await repo.load();
    assertEquals(loadResult.type, "ok");
    if (loadResult.type === "ok") {
      assertEquals(loadResult.value, { workspace: "/workspace2", cwd: "permanent" });
    }
  });

  await t.step("different PPIDs have separate sessions", async () => {
    const repo1 = createFileSessionRepository({
      uid: 1000,
      ppid: 11111,
      baseDir: testBaseDir,
    });
    const repo2 = createFileSessionRepository({
      uid: 1000,
      ppid: 22222,
      baseDir: testBaseDir,
    });

    await repo1.save({ workspace: "/ws", cwd: "2026-01-01" });
    await repo2.save({ workspace: "/ws", cwd: "2026-12-25" });

    const result1 = await repo1.load();
    const result2 = await repo2.load();

    assertEquals(result1.type, "ok");
    if (result1.type === "ok") {
      assertEquals(result1.value?.cwd, "2026-01-01");
    }
    assertEquals(result2.type, "ok");
    if (result2.type === "ok") {
      assertEquals(result2.value?.cwd, "2026-12-25");
    }
  });

  await t.step("different UIDs have separate sessions", async () => {
    const repo1 = createFileSessionRepository({
      uid: 1000,
      ppid: 99999,
      baseDir: testBaseDir,
    });
    const repo2 = createFileSessionRepository({
      uid: 2000,
      ppid: 99999,
      baseDir: testBaseDir,
    });

    await repo1.save({ workspace: "/ws", cwd: "2026-01-01" });
    await repo2.save({ workspace: "/ws", cwd: "2026-12-25" });

    const result1 = await repo1.load();
    const result2 = await repo2.load();

    assertEquals(result1.type, "ok");
    if (result1.type === "ok") {
      assertEquals(result1.value?.cwd, "2026-01-01");
    }
    assertEquals(result2.type, "ok");
    if (result2.type === "ok") {
      assertEquals(result2.value?.cwd, "2026-12-25");
    }
  });

  await t.step("returns null for invalid JSON (treats as missing)", async () => {
    const ppid = 33333;
    const sessionDir = join(testBaseDir, "1000", "sessions");
    await Deno.mkdir(sessionDir, { recursive: true });
    await Deno.writeTextFile(join(sessionDir, `${ppid}.json`), "not valid json");

    const repo = createFileSessionRepository({
      uid: 1000,
      ppid,
      baseDir: testBaseDir,
    });

    const result = await repo.load();
    assertEquals(result.type, "ok");
    if (result.type === "ok") {
      assertEquals(result.value, null);
    }
  });

  // Cleanup
  await Deno.remove(testBaseDir, { recursive: true });
});
