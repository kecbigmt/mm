/**
 * Raw frontmatter data as read from item files, before domain validation.
 * Used by migration to read/write items without going through parseItem.
 */
export type RawItemFrontmatter = Record<string, unknown> & {
  id: string;
  icon: string;
  status: string;
  placement: string;
  rank: string;
  created_at: string;
  updated_at: string;
  schema?: string;
  project?: string;
  contexts?: string[];
  alias?: string;
};

export type RawItemFile = Readonly<{
  filePath: string;
  frontmatter: RawItemFrontmatter;
  body: string;
}>;

export type MigrationScanError = Readonly<{
  kind: "io_error" | "parse_error";
  message: string;
  path: string;
  cause?: unknown;
}>;

export type MigrationItemError = Readonly<{
  path: string;
  alias: string;
  message: string;
}>;
