import { assertEquals } from "@std/assert";
import {
  createResolvedGraphPath,
  formatResolvedGraphPath,
  ResolvedSegment,
} from "./resolved_graph_path.ts";

Deno.test("createResolvedGraphPath - creates path with permanent root", () => {
  const segments: ResolvedSegment[] = [
    { kind: "permanent" },
  ];

  const path = createResolvedGraphPath(segments);

  assertEquals(path.segments.length, 1);
  assertEquals(path.segments[0].kind, "permanent");
});

Deno.test("formatResolvedGraphPath - formats permanent root as /permanent", () => {
  const segments: ResolvedSegment[] = [
    { kind: "permanent" },
  ];

  const path = createResolvedGraphPath(segments);
  const formatted = formatResolvedGraphPath(path);

  assertEquals(formatted, "/permanent");
});
