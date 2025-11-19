/**
 * Shared helpers for creating test workspace fixtures.
 * Used by both fixture generation scripts and unit tests.
 */

import { join } from "@std/path";

// Helper to write a file with directory creation
export async function writeFile(path: string, content: string): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf("/"));
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(path, content);
}

// Helper to create workspace config
export function createConfig(): string {
  return JSON.stringify(
    {
      schema: "mm.config/1",
      settings: {
        timezone: "UTC",
      },
    },
    null,
    2,
  );
}

// Helper to create item frontmatter
export function createItemContent(
  id: string,
  title: string,
  placement: string,
  rank: string,
  options: {
    alias?: string;
    status?: string;
    icon?: string;
    createdAt?: string;
    updatedAt?: string;
  } = {},
): string {
  const status = options.status ?? "open";
  const icon = options.icon ?? "note";
  const createdAt = options.createdAt ?? "2025-01-15T10:00:00Z";
  const updatedAt = options.updatedAt ?? "2025-01-15T10:00:00Z";

  const lines = [
    "---",
    `id: "${id}"`,
    `icon: "${icon}"`,
    `status: "${status}"`,
    `placement: "${placement}"`,
    `rank: "${rank}"`,
    `created_at: "${createdAt}"`,
    `updated_at: "${updatedAt}"`,
    'schema: "mm.item.frontmatter/2"',
  ];

  if (options.alias) {
    lines.push(`alias: "${options.alias}"`);
  }

  lines.push("---", "", `# ${title}`);
  return lines.join("\n");
}

// Helper to create date edge file
export function createDateEdgeContent(itemId: string, rank: string): string {
  return JSON.stringify(
    {
      schema: "mm.edge/1",
      to: itemId,
      rank: rank,
    },
    null,
    2,
  );
}

// Helper to create parent edge file
export function createParentEdgeContent(
  parentId: string,
  childId: string,
  rank: string,
): string {
  return JSON.stringify(
    {
      schema: "mm.edge/1",
      from: parentId,
      to: childId,
      rank: rank,
    },
    null,
    2,
  );
}

// Helper to create alias file
export function createAliasContent(
  raw: string,
  canonicalKey: string,
  itemId: string,
  createdAt?: string,
): string {
  return JSON.stringify(
    {
      schema: "mm.alias/2",
      raw: raw,
      canonicalKey: canonicalKey,
      itemId: itemId,
      createdAt: createdAt ?? "2025-01-15T10:00:00Z",
    },
    null,
    2,
  );
}

// High-level helpers for creating test workspaces

export async function createTestWorkspace(baseDir: string): Promise<string> {
  const workspaceRoot = join(baseDir, "test-workspace");
  await Deno.mkdir(join(workspaceRoot, "items", "2025", "01", "15"), { recursive: true });
  await Deno.mkdir(join(workspaceRoot, ".index", "graph", "dates", "2025-01-15"), {
    recursive: true,
  });
  await Deno.mkdir(join(workspaceRoot, ".index", "aliases", "ab"), { recursive: true });
  await Deno.mkdir(join(workspaceRoot, ".mm"), { recursive: true });
  await writeFile(join(workspaceRoot, ".mm", "config.json"), createConfig());
  return workspaceRoot;
}

export async function createItemFile(
  workspaceRoot: string,
  id: string,
  options: {
    title?: string;
    placement?: string;
    rank?: string;
    alias?: string;
    dateDir?: string;
  } = {},
): Promise<void> {
  const title = options.title ?? "Test Item";
  const placement = options.placement ?? "2025-01-15";
  const rank = options.rank ?? "aaa";
  const dateDir = options.dateDir ?? "2025/01/15";

  const content = createItemContent(id, title, placement, rank, { alias: options.alias });
  const filePath = join(workspaceRoot, "items", dateDir, `${id}.md`);
  await writeFile(filePath, content);
}

export async function createEdgeFile(
  workspaceRoot: string,
  dateStr: string,
  itemId: string,
  rank: string,
): Promise<void> {
  const content = createDateEdgeContent(itemId, rank);
  const filePath = join(
    workspaceRoot,
    ".index",
    "graph",
    "dates",
    dateStr,
    `${itemId}.edge.json`,
  );
  await writeFile(filePath, content);
}

export async function createAliasFile(
  workspaceRoot: string,
  hash: string,
  snapshot: {
    raw: string;
    canonicalKey: string;
    itemId: string;
    createdAt?: string;
  },
): Promise<void> {
  const content = createAliasContent(
    snapshot.raw,
    snapshot.canonicalKey,
    snapshot.itemId,
    snapshot.createdAt,
  );
  const filePath = join(
    workspaceRoot,
    ".index",
    "aliases",
    hash.slice(0, 2),
    `${hash}.alias.json`,
  );
  await writeFile(filePath, content);
}
