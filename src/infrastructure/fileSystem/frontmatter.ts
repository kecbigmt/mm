import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { TextLineStream } from "@std/streams";
import { Result } from "../../shared/result.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";

export type FrontmatterParseResult<T> = Readonly<{
  frontmatter: T;
  body: string;
}>;

export type StreamingParseResult<T> = Readonly<{
  frontmatter: T;
  title: string | undefined;
}>;

/**
 * Parse a Markdown file with YAML Frontmatter
 * Expected format:
 * ```
 * ---
 * key: value
 * ---
 * Markdown body content
 * ```
 */
export const parseFrontmatter = <T = Record<string, unknown>>(
  content: string,
): Result<FrontmatterParseResult<T>, ValidationError<"Frontmatter">> => {
  const normalized = content.replace(/\r\n/g, "\n");

  // Check if content starts with frontmatter delimiter
  if (!normalized.startsWith("---\n")) {
    return Result.error(
      createValidationError("Frontmatter", [{
        message: "content must start with '---'",
        code: "invalid_format",
        path: [],
      }]),
    );
  }

  // Find the end of frontmatter
  const endDelimiterIndex = normalized.indexOf("\n---\n", 4);
  if (endDelimiterIndex === -1) {
    return Result.error(
      createValidationError("Frontmatter", [{
        message: "frontmatter closing delimiter '---' not found",
        code: "invalid_format",
        path: [],
      }]),
    );
  }

  const yamlContent = normalized.slice(4, endDelimiterIndex);
  const bodyStart = endDelimiterIndex + 5; // skip "\n---\n"
  const body = normalized.slice(bodyStart);

  // Parse YAML
  try {
    const frontmatter = parseYaml(yamlContent) as T;
    if (frontmatter === null || typeof frontmatter !== "object") {
      return Result.error(
        createValidationError("Frontmatter", [{
          message: "frontmatter must be a YAML object",
          code: "invalid_type",
          path: [],
        }]),
      );
    }
    return Result.ok({
      frontmatter,
      body: body.trimEnd(),
    });
  } catch (error) {
    return Result.error(
      createValidationError("Frontmatter", [{
        message: `failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
        code: "yaml_parse_error",
        path: [],
      }]),
    );
  }
};

/**
 * Parse an item file using streaming to minimize memory usage.
 * Extracts frontmatter and title (first H1) without loading the entire file.
 *
 * @param filePath - Path to the .md file
 * @returns Result with frontmatter and title
 */
export const parseItemFileStreaming = async <T = Record<string, unknown>>(
  filePath: string,
): Promise<Result<StreamingParseResult<T>, ValidationError<"Frontmatter">>> => {
  let file: Deno.FsFile | undefined;

  try {
    file = await Deno.open(filePath, { read: true });

    const lineStream = file.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream());

    type State = "initial" | "frontmatter" | "body";
    let state: State = "initial";
    const yamlLines: string[] = [];
    let title: string | undefined;

    for await (const line of lineStream) {
      if (state === "initial") {
        if (line === "---") {
          state = "frontmatter";
        } else {
          return Result.error(
            createValidationError("Frontmatter", [{
              message: "content must start with '---'",
              code: "invalid_format",
              path: [],
            }]),
          );
        }
      } else if (state === "frontmatter") {
        if (line === "---") {
          state = "body";
        } else {
          yamlLines.push(line);
        }
      } else if (state === "body") {
        // Look for first H1 heading
        const trimmed = line.trim();
        if (trimmed.startsWith("# ")) {
          title = trimmed.slice(2).trim();
          // Found title, we can stop reading
          break;
        }
        // Skip empty lines and continue searching for H1
        if (trimmed !== "") {
          // If we encounter non-empty, non-H1 line, we can stop (no title)
          break;
        }
      }
    }

    if (state !== "body") {
      return Result.error(
        createValidationError("Frontmatter", [{
          message: "frontmatter closing delimiter '---' not found",
          code: "invalid_format",
          path: [],
        }]),
      );
    }

    // Parse YAML
    const yamlContent = yamlLines.join("\n");
    try {
      const frontmatter = parseYaml(yamlContent) as T;
      if (frontmatter === null || typeof frontmatter !== "object") {
        return Result.error(
          createValidationError("Frontmatter", [{
            message: "frontmatter must be a YAML object",
            code: "invalid_type",
            path: [],
          }]),
        );
      }

      return Result.ok({
        frontmatter,
        title,
      });
    } catch (error) {
      return Result.error(
        createValidationError("Frontmatter", [{
          message: `failed to parse YAML: ${
            error instanceof Error ? error.message : String(error)
          }`,
          code: "yaml_parse_error",
          path: [],
        }]),
      );
    }
  } catch (error) {
    return Result.error(
      createValidationError("Frontmatter", [{
        message: `failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        code: "file_read_error",
        path: [],
      }]),
    );
  } finally {
    // Ensure file is always closed
    if (file) {
      try {
        file.close();
      } catch {
        // Ignore errors when closing (file might already be closed)
      }
    }
  }
};

/**
 * Serialize frontmatter and body to a Markdown file content
 */
export const serializeFrontmatter = (
  frontmatter: Record<string, unknown>,
  body: string,
): string => {
  // Remove undefined values
  const cleanedFrontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) {
      cleanedFrontmatter[key] = value;
    }
  }

  const yamlContent = stringifyYaml(cleanedFrontmatter, {
    skipInvalid: true,
    sortKeys: false,
  }).trim();

  const normalizedBody = body.trim();

  return `---\n${yamlContent}\n---\n${normalizedBody}\n`;
};
