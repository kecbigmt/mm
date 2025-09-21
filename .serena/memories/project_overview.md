# Project Overview

**Project Name**: mm (personal knowledge management CLI)

**Purpose**: A personal knowledge management CLI tool with built-in MCP server. It implements a local-files PKM system that unifies GTD / Bullet Journal / Zettelkasten methodologies via a single Node model, stored as plain Markdown + JSON in a Git-friendly format.

**Tech Stack**:
- Language: TypeScript with Deno runtime
- Testing: Deno's built-in test runner
- Code Quality: deno fmt (formatter) and deno lint (linter)
- Dependencies: Minimal, using jsr:@std packages (assert, path)

**Architecture**:
- Functional domain core with immutable data structures
- Domain logic in `src/domain/` (primitives, models, workflows, services, repositories)
- Infrastructure adapters in `src/infrastructure/` (filesystem implementations, MCP server)
- Presentation layer in `src/presentation/` (CLI commands)
- Shared utilities in `src/shared/` (result types, errors, branded types)

**Key Domain Concepts**:
- **Node**: Abstract type with two concrete kinds - Container and Item
- **Container**: Fixed place to hold nodes, addressed by path, not movable
- **Item**: Content-bearing node with UUID v7 identifier, can be moved (via edge relocation)
- **Workspace**: Graph of nodes with alias/context metadata and fixed timezone
- **Edge**: Represents parent-child relationships and ordering (via LexoRank)

**File Storage Layout**:
```
/workspace-root/
  workspace.json      # Timezone configuration
  nodes/
    YYYY/MM/DD/      # Calendar-based storage
      <uuidv7>/      # Item storage
        content.md   # Markdown body
        meta.json    # Metadata
        edges/       # Child relationships
  aliases/           # Human-friendly slug mappings
  contexts/          # Tagging/filtering metadata
```