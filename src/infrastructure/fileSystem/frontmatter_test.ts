import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { parseFrontmatter, parseItemFileStreaming, serializeFrontmatter } from "./frontmatter.ts";

Deno.test("parseFrontmatter - parses valid frontmatter and body", () => {
  const content = `---
id: "test-id"
title: "Test Title"
tags:
  - tag1
  - tag2
---
# Heading

Body content here.`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.frontmatter, {
      id: "test-id",
      title: "Test Title",
      tags: ["tag1", "tag2"],
    });
    assertEquals(result.value.body, "# Heading\n\nBody content here.");
  }
});

Deno.test("parseFrontmatter - handles empty body", () => {
  const content = `---
id: "test-id"
---
`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.frontmatter, { id: "test-id" });
    assertEquals(result.value.body, "");
  }
});

Deno.test("parseFrontmatter - handles CRLF line endings", () => {
  const content = `---\r\nid: "test-id"\r\n---\r\nBody`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.frontmatter, { id: "test-id" });
    assertEquals(result.value.body, "Body");
  }
});

Deno.test("parseFrontmatter - returns error when missing opening delimiter", () => {
  const content = `id: "test-id"\n---\nBody`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_format");
    assertEquals(result.error.issues[0].message, "content must start with '---'");
  }
});

Deno.test("parseFrontmatter - returns error when missing closing delimiter", () => {
  const content = `---\nid: "test-id"\nBody`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_format");
    assertEquals(result.error.issues[0].message, "frontmatter closing delimiter '---' not found");
  }
});

Deno.test("parseFrontmatter - returns error when YAML is invalid", () => {
  const content = `---
invalid: [unclosed
---
Body`;

  const result = parseFrontmatter(content);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "yaml_parse_error");
  }
});

Deno.test("serializeFrontmatter - serializes frontmatter and body", () => {
  const frontmatter = {
    id: "test-id",
    title: "Test Title",
    tags: ["tag1", "tag2"],
  };
  const body = "# Heading\n\nBody content.";

  const result = serializeFrontmatter(frontmatter, body);

  // Parse it back to verify roundtrip
  const parseResult = parseFrontmatter(result);
  assertEquals(parseResult.type, "ok");
  if (parseResult.type === "ok") {
    assertEquals(parseResult.value.frontmatter, frontmatter);
    assertEquals(parseResult.value.body, body);
  }
});

Deno.test("serializeFrontmatter - handles empty body", () => {
  const frontmatter = {
    id: "test-id",
  };
  const body = "";

  const result = serializeFrontmatter(frontmatter, body);

  const parseResult = parseFrontmatter(result);
  assertEquals(parseResult.type, "ok");
  if (parseResult.type === "ok") {
    assertEquals(parseResult.value.frontmatter, frontmatter);
    assertEquals(parseResult.value.body, "");
  }
});

Deno.test("serializeFrontmatter - skips undefined values", () => {
  const frontmatter = {
    id: "test-id",
    optional: undefined,
  };
  const body = "Body";

  const result = serializeFrontmatter(frontmatter, body);

  const parseResult = parseFrontmatter(result);
  assertEquals(parseResult.type, "ok");
  if (parseResult.type === "ok") {
    assertEquals(parseResult.value.frontmatter, { id: "test-id" });
    assertEquals(parseResult.value.body, "Body");
  }
});

// Streaming parser tests

Deno.test("parseItemFileStreaming - parses frontmatter and extracts title", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = join(tmpDir, "test.md");

  const content = `---
id: "test-id"
status: "open"
---
# Test Title

Body content here.`;

  await Deno.writeTextFile(filePath, content);

  const result = await parseItemFileStreaming(filePath);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.frontmatter, {
      id: "test-id",
      status: "open",
    });
    assertEquals(result.value.title, "Test Title");
  }

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("parseItemFileStreaming - handles no title", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = join(tmpDir, "test.md");

  const content = `---
id: "test-id"
---
Body without heading.`;

  await Deno.writeTextFile(filePath, content);

  const result = await parseItemFileStreaming(filePath);

  if (result.type === "error") {
    console.error("Parse error:", result.error);
  }

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.frontmatter, { id: "test-id" });
    assertEquals(result.value.title, undefined);
  }

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("parseItemFileStreaming - handles empty lines before title", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = join(tmpDir, "test.md");

  const content = `---
id: "test-id"
---


# Title After Empty Lines`;

  await Deno.writeTextFile(filePath, content);

  const result = await parseItemFileStreaming(filePath);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.title, "Title After Empty Lines");
  }

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("parseItemFileStreaming - stops reading after title", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = join(tmpDir, "test.md");

  // Large file with title at the beginning
  const content = `---
id: "test-id"
---
# First Title

` + "Lorem ipsum ".repeat(10000); // Add lots of content after title

  await Deno.writeTextFile(filePath, content);

  const result = await parseItemFileStreaming(filePath);

  assertEquals(result.type, "ok");
  if (result.type === "ok") {
    assertEquals(result.value.title, "First Title");
    // Should have stopped reading after title, not loading all Lorem ipsum
  }

  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("parseItemFileStreaming - returns error for missing file", async () => {
  const result = await parseItemFileStreaming("/nonexistent/file.md");

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "file_read_error");
  }
});

Deno.test("parseItemFileStreaming - returns error for missing opening delimiter", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = join(tmpDir, "test.md");

  const content = `id: "test-id"\n---\nBody`;

  await Deno.writeTextFile(filePath, content);

  const result = await parseItemFileStreaming(filePath);

  assertEquals(result.type, "error");
  if (result.type === "error") {
    assertEquals(result.error.issues[0].code, "invalid_format");
    assertEquals(result.error.issues[0].message, "content must start with '---'");
  }

  await Deno.remove(tmpDir, { recursive: true });
});
