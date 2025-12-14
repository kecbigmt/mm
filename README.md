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

**Shell Completion (optional):** Enable tab completion for Zsh/Bash by adding
`source <(mm completions zsh)` or `source <(mm completions bash)` to your shell config. See
[Shell Completion](#shell-completion) for details.

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
# With full ISO 8601 (UTC)
mm task "Review PR" --due-at "2025-01-20T17:00:00Z"

# With local time (no timezone)
mm task "Review PR" --due-at "2025-01-20T17:00"

# With time only (uses today's date)
mm t "Fix bug" --due-at "17:00" --context work
```

Options:

- `-b, --body <body>` - Body text
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <context>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-d, --due-at <datetime>` - Due date/time in one of these formats:
  - ISO 8601 with timezone: `2025-01-20T17:00:00Z` or `2025-01-20T17:00:00+09:00`
  - ISO 8601 local time: `2025-01-20T17:00` (interpreted as local time)
  - Time only: `17:00` or `17:00:00` (uses parent placement date or today)
- `-e, --edit` - Open editor after creation

#### `event [title]`

Create a new event. Alias: `ev`

```sh
# With full ISO 8601 (UTC)
mm event "Team meeting" --start-at "2025-01-15T14:00:00Z" --duration 2h

# With local time (no timezone)
mm event "Team meeting" --start-at "2025-11-21T15:00" --duration 1h

# With time only (uses parent date)
mm event "Lunch" --start-at "12:00" --duration 1h
```

Options:

- `-b, --body <body>` - Body text
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <context>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-s, --start-at <datetime>` - Start date/time in one of these formats:
  - ISO 8601 with timezone: `2025-01-15T14:00:00Z` or `2025-01-15T14:00:00+09:00`
  - ISO 8601 local time: `2025-01-15T14:00` (interpreted as local time)
  - Time only: `14:00` or `14:00:00` (uses parent placement date or today)
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

## Shell Completion

mm provides tab completion for commands, flags, and recently used aliases/tags in Zsh and Bash.

### Installation

#### Zsh

Add the following to your `~/.zshrc`:

```sh
source <(mm completions zsh)
```

Then restart your shell or run `source ~/.zshrc`.

#### Bash

Add the following to your `~/.bashrc` or `~/.bash_profile`:

```sh
source <(mm completions bash)
```

Then restart your shell or run `source ~/.bashrc`.

### What Gets Completed

- **Commands**: All mm commands (`note`, `task`, `edit`, `list`, `move`, `close`, etc.)
- **Flags**: Context-aware flag completion for each command (e.g., `--context`, `--parent`,
  `--alias`)
- **Aliases**: Recently used item aliases when editing or moving items (cached from recent
  operations)
- **Context tags**: Recently used tags when specifying `--context` (cached from recent operations)

### How It Works

Completion suggestions for aliases and tags are powered by cache files stored in your workspace's
`.index/` directory. These cache files are automatically updated when you use commands like `list`,
`edit`, `note`, and `close`.

The completion system resolves your current workspace from `MM_HOME/config.json` (defaulting to
`~/.mm`), so completions work from any directory.
