import { assert } from "@std/assert";
import { join } from "@std/path";
import { createGitVersionControlService } from "./git_client.ts";

const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
};

Deno.test("GitClient integration", async (t) => {
  const client = createGitVersionControlService();

  // Setup temp dir
  const tmpDir = await Deno.makeTempDir();

  try {
    await t.step("init creates .git directory", async () => {
      const result = await client.init(tmpDir);
      assert(result.type === "ok");
      assert(await exists(join(tmpDir, ".git")));
    });

    await t.step("setRemote configures remote", async () => {
      const result = await client.setRemote(tmpDir, "origin", "https://example.com/repo.git");
      assert(result.type === "ok");

      const config = await Deno.readTextFile(join(tmpDir, ".git/config"));
      assert(config.includes("url = https://example.com/repo.git"));
    });

    await t.step("setRemote fails on conflicting remote", async () => {
      const result = await client.setRemote(tmpDir, "origin", "https://example.com/other.git");
      assert(result.type === "error");
      assert(result.error.message.includes("already exists with different URL"));
      assert(result.error.message.includes("force"));

      // Verify config didn't change (still previous)
      const config = await Deno.readTextFile(join(tmpDir, ".git/config"));
      assert(config.includes("url = https://example.com/repo.git"));
    });

    await t.step("setRemote succeeds on conflicting remote with force option", async () => {
      const result = await client.setRemote(tmpDir, "origin", "https://example.com/other.git", {
        force: true,
      });
      assert(result.type === "ok");

      const config = await Deno.readTextFile(join(tmpDir, ".git/config"));
      assert(config.includes("url = https://example.com/other.git"));
    });

    await t.step("setRemote succeeds on idempotent update", async () => {
      const result = await client.setRemote(tmpDir, "origin", "https://example.com/other.git");
      assert(result.type === "ok");
    });

    await t.step("setRemote handles missing remote via fallback", async () => {
      // Manually remove remote to trigger fallback logic in setRemote
      const cmd = new Deno.Command("git", { args: ["remote", "remove", "origin"], cwd: tmpDir });
      await cmd.output();

      const result = await client.setRemote(tmpDir, "origin", "https://example.com/restored.git");
      assert(result.type === "ok");

      const config = await Deno.readTextFile(join(tmpDir, ".git/config"));
      assert(config.includes("url = https://example.com/restored.git"));
    });

    await t.step("stage and commit creates commit", async () => {
      // create a file
      await Deno.writeTextFile(join(tmpDir, "test.txt"), "hello");

      const stageResult = await client.stage(tmpDir, ["."]);
      assert(stageResult.type === "ok", "Stage failed");

      // Need to configure email/name for commit to work in CI/test env if not global
      const p1 = new Deno.Command("git", {
        args: ["config", "user.email", "test@example.com"],
        cwd: tmpDir,
      });
      await p1.output();
      const p2 = new Deno.Command("git", {
        args: ["config", "user.name", "Test User"],
        cwd: tmpDir,
      });
      await p2.output();

      const commitResult = await client.commit(tmpDir, "initial commit");

      if (commitResult.type === "error") {
        console.error("Commit error:", commitResult.error);
      }
      assert(commitResult.type === "ok", "Commit failed");

      // Verify log
      const logCmd = new Deno.Command("git", { args: ["log", "--oneline"], cwd: tmpDir });
      const { stdout } = await logCmd.output();
      const log = new TextDecoder().decode(stdout);
      assert(log.includes("initial commit"));
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
