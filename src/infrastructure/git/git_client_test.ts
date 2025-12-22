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

Deno.test("GitClient.clone", async (t) => {
  const client = createGitVersionControlService();

  // Create a source repo to clone from
  const sourceDir = await Deno.makeTempDir();
  const targetDir = await Deno.makeTempDir();

  try {
    // Setup source repo
    await new Deno.Command("git", { args: ["init"], cwd: sourceDir }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: sourceDir,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: sourceDir,
    }).output();
    await Deno.writeTextFile(join(sourceDir, "test.txt"), "hello");
    await new Deno.Command("git", { args: ["add", "."], cwd: sourceDir }).output();
    await new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: sourceDir,
    }).output();

    // Remove target dir so clone can create it
    await Deno.remove(targetDir, { recursive: true });

    await t.step("clone creates repository at target path", async () => {
      const result = await client.clone(sourceDir, targetDir);
      assert(
        result.type === "ok",
        `Clone failed: ${result.type === "error" ? result.error.message : ""}`,
      );
      assert(await exists(join(targetDir, ".git")));
      assert(await exists(join(targetDir, "test.txt")));
    });

    await t.step("clone with branch checks out specified branch", async () => {
      // Create a branch in source
      await new Deno.Command("git", {
        args: ["checkout", "-b", "feature"],
        cwd: sourceDir,
      }).output();
      await Deno.writeTextFile(join(sourceDir, "feature.txt"), "feature content");
      await new Deno.Command("git", { args: ["add", "."], cwd: sourceDir }).output();
      await new Deno.Command("git", {
        args: ["commit", "-m", "feature commit"],
        cwd: sourceDir,
      }).output();

      // Clone to new target with branch
      const targetDir2 = await Deno.makeTempDir();
      await Deno.remove(targetDir2, { recursive: true });

      const result = await client.clone(sourceDir, targetDir2, { branch: "feature" });
      assert(
        result.type === "ok",
        `Clone failed: ${result.type === "error" ? result.error.message : ""}`,
      );

      // Verify branch
      const branchResult = await client.getCurrentBranch(targetDir2);
      assert(branchResult.type === "ok");
      assert(branchResult.value === "feature", `Expected 'feature', got '${branchResult.value}'`);

      // Verify feature file exists
      assert(await exists(join(targetDir2, "feature.txt")));

      await Deno.remove(targetDir2, { recursive: true });
    });

    await t.step("clone fails with invalid URL", async () => {
      const invalidTarget = await Deno.makeTempDir();
      await Deno.remove(invalidTarget, { recursive: true });

      const result = await client.clone(
        "https://invalid.example.com/nonexistent.git",
        invalidTarget,
      );
      assert(result.type === "error");
    });
  } finally {
    await Deno.remove(sourceDir, { recursive: true });
    try {
      await Deno.remove(targetDir, { recursive: true });
    } catch {
      // May not exist if test failed early
    }
  }
});

Deno.test("GitClient.stage with non-existent paths", async (t) => {
  const client = createGitVersionControlService();
  const tmpDir = await Deno.makeTempDir();

  try {
    // Initialize git repo
    await new Deno.Command("git", { args: ["init"], cwd: tmpDir }).output();
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: tmpDir,
    }).output();
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: tmpDir,
    }).output();

    await t.step("stage succeeds with all non-existent paths", async () => {
      const result = await client.stage(tmpDir, ["nonexistent", "also-missing"]);
      assert(result.type === "ok", "Stage should succeed with non-existent paths");
    });

    await t.step("stage only stages existing paths when mixed", async () => {
      // Create one file
      await Deno.writeTextFile(join(tmpDir, "exists.txt"), "content");

      const result = await client.stage(tmpDir, ["exists.txt", "missing.txt"]);
      assert(result.type === "ok", "Stage should succeed");

      // Verify only exists.txt is staged
      const statusCmd = new Deno.Command("git", {
        args: ["status", "--porcelain"],
        cwd: tmpDir,
        stdout: "piped",
      });
      const { stdout } = await statusCmd.output();
      const status = new TextDecoder().decode(stdout);
      assert(status.includes("A  exists.txt"), "exists.txt should be staged");
      assert(!status.includes("missing.txt"), "missing.txt should not appear");
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
