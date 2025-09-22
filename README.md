# mm CLI

mm is a personal knowledge management CLI that stores notes and tasks as Markdown and JSON files.
The tool organises content as a graph of container and item nodes, keeping immutable on-disk
locations while managing logical placements through edges and ranks.

## Documentation

Domain and product design notes live in `docs/steering/design.md`.

## Getting Started

```sh
deno task dev
```

Use `deno task test` to run the full unit test suite.

Build a standalone binary with `deno task compile`, or install the CLI globally via
`deno task install`.

## Commands

### Creating Items

#### `note [title]`

Create a new note.

```sh
mm note "My note title"
mm note --body "Note content" --date today "Weekly Review"
```

Options:

- `-b, --body <body>` - Body text
- `-p, --project <project>` - Project tag
- `-c, --context <context>` - Context tag
- `-d, --date <date>` - Note date (flexible: YYYY-MM-DD, today, tomorrow, etc.)
- `-e, --edit` - Open editor after creation

### Managing Item Status

#### `close <ids...>`

Close one or more items (tasks/notes/events).

```sh
mm close abc1234
mm close abc1234 def5678 ghi9012
```

#### `reopen <ids...>`

Reopen one or more closed items.

```sh
mm reopen abc1234
mm reopen abc1234 def5678
```

Both commands accept:

- **Full item IDs**: Complete UUID v7 identifiers
- **Short IDs**: Last 7 characters of the item ID (e.g., `abc1234`)

If a short ID matches multiple items, the command will show an error listing the ambiguous matches.

### Workspace Management

Workspaces are stored under `~/.mm/workspaces` by default (override with `MM_HOME`). The `workspace`
command also accepts the short alias `ws`.

#### `workspace list`

Show all known workspaces and highlight the active one.

```sh
mm workspace list
mm ws list
```

#### `workspace init <name>`

Create a new workspace (fails if one already exists) and switch to it immediately. Optionally set
the timezone to embed in the new workspace.

```sh
mm workspace init research
mm ws init client-a --timezone Asia/Tokyo
```

Options:

- `-t, --timezone <iana-id>` – Timezone identifier for the new workspace (default: host timezone)

#### `workspace use <name>`

Switch to an existing workspace. If the workspace is missing, it is created first using the
specified (or default) timezone.

```sh
mm workspace use research
mm ws use client-a --timezone Asia/Tokyo
```
