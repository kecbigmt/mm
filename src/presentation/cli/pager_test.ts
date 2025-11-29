import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { outputWithPagerCore, type PagerSpawner } from "./pager.ts";

describe("outputWithPagerCore", () => {
  /**
   * Creates a mock spawner that records calls and simulates success.
   */
  const createMockSpawner = () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const writtenData: Uint8Array[] = [];

    const spawner: PagerSpawner = (cmd, args) => {
      calls.push({ cmd, args });
      return {
        stdin: {
          getWriter: () =>
            ({
              write: (data: Uint8Array) => {
                writtenData.push(data);
                return Promise.resolve();
              },
              close: () => Promise.resolve(),
            }) as unknown as WritableStreamDefaultWriter<Uint8Array>,
        },
        status: Promise.resolve({ success: true }),
      };
    };

    return { spawner, calls, writtenData };
  };

  /**
   * Creates a mock output collector.
   */
  const createMockOutput = () => {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => errors.push(msg),
      logs,
      errors,
    };
  };

  it("spawns pager with parsed command and args from PAGER env", async () => {
    const { spawner, calls, writtenData } = createMockSpawner();
    const output = createMockOutput();

    const result = await outputWithPagerCore(
      "test content",
      "less -FR",
      spawner,
      output,
    );

    assertEquals(result.usedPager, true);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].cmd, "less");
    assertEquals(calls[0].args, ["-FR"]);
    assertEquals(new TextDecoder().decode(writtenData[0]), "test content");
  });

  it("falls back to less -R when PAGER is undefined", async () => {
    const { spawner, calls } = createMockSpawner();
    const output = createMockOutput();

    await outputWithPagerCore("content", undefined, spawner, output);

    assertEquals(calls[0].cmd, "less");
    assertEquals(calls[0].args, ["-R"]);
  });

  it("outputs warning and text directly when spawner throws", async () => {
    const spawner: PagerSpawner = () => {
      throw new Error("spawn ENOENT");
    };
    const output = createMockOutput();

    const result = await outputWithPagerCore(
      "fallback content",
      "nonexistent-pager",
      spawner,
      output,
    );

    assertEquals(result.usedPager, false);
    assertEquals(output.errors, ["warning: pager unavailable, outputting directly"]);
    assertEquals(output.logs, ["fallback content"]);
  });
});
