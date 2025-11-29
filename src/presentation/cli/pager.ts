/**
 * Pager utility for outputting text through a pager like less or bat.
 */

/**
 * Parse a shell-like command string into command and arguments.
 * Handles simple quoting (single and double quotes) and backslash escapes.
 */
const parseShellCommand = (cmd: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (const char of cmd) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

/**
 * Resolve pager command and arguments from PAGER environment variable.
 * Falls back to "less -R -F" if PAGER is unset or empty.
 * -R preserves colors, -F auto-exits if content fits on one screen.
 */
const resolvePagerCommand = (
  pagerEnv: string | undefined,
): { cmd: string; args: string[] } => {
  if (pagerEnv) {
    const tokens = parseShellCommand(pagerEnv);
    if (tokens.length === 0) {
      return { cmd: "less", args: ["-R", "-F"] };
    }
    return { cmd: tokens[0], args: tokens.slice(1) };
  }
  return { cmd: "less", args: ["-R", "-F"] };
};

/**
 * Spawner interface for dependency injection in tests.
 */
export type PagerSpawner = (
  cmd: string,
  args: string[],
) => {
  stdin: { getWriter: () => WritableStreamDefaultWriter<Uint8Array> };
  status: Promise<{ success: boolean }>;
};

/**
 * Default spawner using Deno.Command.
 */
const defaultPagerSpawner: PagerSpawner = (cmd, args) => {
  const command = new Deno.Command(cmd, {
    args,
    stdin: "piped",
    stdout: "inherit",
    stderr: "inherit",
  });
  return command.spawn();
};

/**
 * Output text through a pager. Testable version with injectable spawner.
 * Returns { usedPager: true } on success, { usedPager: false, warning } on failure.
 */
export const outputWithPagerCore = async (
  text: string,
  pagerEnv: string | undefined,
  spawner: PagerSpawner,
  output: { log: (msg: string) => void; error: (msg: string) => void },
): Promise<{ usedPager: boolean; warning?: string }> => {
  const { cmd: pagerCmd, args: pagerArgs } = resolvePagerCommand(pagerEnv);

  try {
    const process = spawner(pagerCmd, pagerArgs);
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();
    await process.status;
    return { usedPager: true };
  } catch {
    const warning = "warning: pager unavailable, outputting directly";
    output.error(warning);
    output.log(text);
    return { usedPager: false, warning };
  }
};

/**
 * Output text through a pager (PAGER env or less -R fallback).
 * Falls back to direct output if pager is unavailable.
 */
export const outputWithPager = async (text: string): Promise<void> => {
  await outputWithPagerCore(text, Deno.env.get("PAGER"), defaultPagerSpawner, {
    log: console.log,
    error: console.error,
  });
};
