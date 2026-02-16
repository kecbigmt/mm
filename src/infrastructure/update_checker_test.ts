import { assertEquals } from "@std/assert";
import { compareVersions } from "./update_checker.ts";

Deno.test("compareVersions", async (t) => {
  await t.step("equal versions return 0", () => {
    assertEquals(compareVersions("1.2.3", "1.2.3"), 0);
  });

  await t.step("major difference", () => {
    assertEquals(compareVersions("1.0.0", "2.0.0"), -1);
    assertEquals(compareVersions("2.0.0", "1.0.0"), 1);
  });

  await t.step("minor difference", () => {
    assertEquals(compareVersions("1.1.0", "1.2.0"), -1);
    assertEquals(compareVersions("1.2.0", "1.1.0"), 1);
  });

  await t.step("patch difference", () => {
    assertEquals(compareVersions("1.0.1", "1.0.2"), -1);
    assertEquals(compareVersions("1.0.2", "1.0.1"), 1);
  });

  await t.step("multi-digit segments", () => {
    assertEquals(compareVersions("1.9.0", "1.10.0"), -1);
    assertEquals(compareVersions("0.5.0", "0.12.0"), -1);
  });

  await t.step("missing patch treated as 0", () => {
    assertEquals(compareVersions("1.0", "1.0.0"), 0);
    assertEquals(compareVersions("1.0", "1.0.1"), -1);
  });

  await t.step("0.0.0 vs 0.0.1", () => {
    assertEquals(compareVersions("0.0.0", "0.0.1"), -1);
  });
});
