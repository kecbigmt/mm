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

Create a new note. Alias: `n`

```sh
mm note "My note title"
mm n --body "Note content" "Weekly Review"
```

Options:

- `-b, --body <body>` - Body text
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <context>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-e, --edit` - Open editor after creation

#### `task [title]`

Create a new task. Alias: `t`

```sh
mm task "Review PR" --due-at "2025-01-20T17:00:00Z"
mm t "Fix bug" --context work
```

Options:

- `-b, --body <body>` - Body text
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <context>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-d, --due-at <datetime>` - Due date/time (ISO 8601 format)
- `-e, --edit` - Open editor after creation

#### `event [title]`

Create a new event. Alias: `ev`

```sh
mm event "Team meeting" --start-at "2025-01-15T14:00:00Z" --duration 2h
mm ev "Lunch" --start-at "2025-01-15T12:00:00Z" --duration 1h
```

Options:

- `-b, --body <body>` - Body text
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <context>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-s, --start-at <datetime>` - Start date/time (ISO 8601 format)
- `-d, --duration <duration>` - Duration (e.g., 30m, 2h, 1h30m)
- `-e, --edit` - Open editor after creation

**Note:** For events with `--start-at`, the date portion must match the parent placement date for
calendar-based placements (e.g., `/2025-01-15`). This validation is skipped for item-based
placements.

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

### Maintenance

#### `doctor check`

Validate workspace integrity without making modifications. Reports frontmatter issues, graph
inconsistencies, and index sync problems.

```sh
mm doctor check
```

#### `doctor rebuild-index`

Rebuild `.index/` directory from item frontmatter. Use after cloning workspace or when index is
corrupted.

```sh
mm doctor rebuild-index
```

#### `doctor rebalance-rank <paths...>`

Rebalance LexoRank values for items in specified paths to restore insertion headroom.

```sh
mm doctor rebalance-rank today
mm doctor rebalance-rank 2025-01-15 book-alias
```
