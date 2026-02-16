export const WORKSPACE_SCHEMA_V1 = "mm.workspace/1" as const;
export const WORKSPACE_SCHEMA_V2 = "mm.workspace/2" as const;

export const CURRENT_WORKSPACE_SCHEMA = WORKSPACE_SCHEMA_V2;

export type WorkspaceSchemaVersion =
  | typeof WORKSPACE_SCHEMA_V1
  | typeof WORKSPACE_SCHEMA_V2;

export const ITEM_SCHEMA_V3 = "mm.item.frontmatter/3" as const;
export const ITEM_SCHEMA_V4 = "mm.item.frontmatter/4" as const;

export const CURRENT_ITEM_SCHEMA = ITEM_SCHEMA_V4;
