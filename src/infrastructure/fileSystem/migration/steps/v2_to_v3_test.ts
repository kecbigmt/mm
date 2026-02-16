import { assertEquals } from "@std/assert";
import { ITEM_SCHEMA_V4, ITEM_SCHEMA_V5 } from "../../workspace_schema.ts";
import type { RawItemFrontmatter } from "../types.ts";
import { v2ToV3Step } from "./v2_to_v3.ts";

// Simulate pre-migration frontmatter with old "placement" field
// (cast needed because RawItemFrontmatter now has "directory" instead)
const baseFm = {
  id: "00000000-0000-0000-0000-000000000001",
  icon: "📝",
  status: "active",
  placement: "date/2025-01-15",
  rank: "aaa",
  created_at: "2025-01-15T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
  schema: ITEM_SCHEMA_V4,
} as unknown as RawItemFrontmatter;

Deno.test("v2ToV3Step.transform renames placement to directory and bumps schema", () => {
  const result = v2ToV3Step.transform(baseFm, new Map());
  assertEquals(result.type, "ok");
  if (result.type !== "ok") return;

  assertEquals(result.value.schema, ITEM_SCHEMA_V5);
  assertEquals((result.value as Record<string, unknown>)["directory"], "date/2025-01-15");
  assertEquals("placement" in result.value, false);
});

Deno.test("v2ToV3Step.needsTransformation returns true when placement exists", () => {
  assertEquals(v2ToV3Step.needsTransformation(baseFm), true);
});

Deno.test("v2ToV3Step.needsTransformation returns false when placement absent", () => {
  const fm = { ...baseFm } as Record<string, unknown>;
  fm["directory"] = fm["placement"];
  delete fm["placement"];
  assertEquals(v2ToV3Step.needsTransformation(fm as RawItemFrontmatter), false);
});

Deno.test("v2ToV3Step.collectExternalReferences returns empty array", () => {
  assertEquals(v2ToV3Step.collectExternalReferences([]), []);
});
