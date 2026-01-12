# mm CLI

mm is a Personal Knowledge Operating System (PKOS) that unifies GTD, Bullet Journal, and
Zettelkasten methodologies.

**Key Features:**

- Unix-like path navigation (`cd`, `ls`, `pwd`) over a knowledge graph
- Manages notes, tasks, and events as plain text Markdown files with YAML frontmatter
- Git-friendly and human-editable content

English | [日本語](README.ja.md)

## Table of Contents

- [Documentation](#documentation)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Commands](#commands)
  - [Creating Items](#creating-items)
  - [Managing Item Status](#managing-item-status)
  - [Navigation](#navigation)
  - [Workspace Management](#workspace-management)
  - [Configuration](#configuration)
  - [Git Synchronization](#git-synchronization)
  - [Maintenance](#maintenance)
- [Shell Completion](#shell-completion)

## Documentation

Domain and product design notes live in [docs/steering/design.md](docs/steering/design.md).

## Prerequisites

- macOS or Linux
- [Deno](https://deno.com/) v2.x or later
- Git (optional, required for sync features)

## Getting Started

First, clone the repository:

```sh
git clone https://github.com/kecbigmt/mm.git
cd mm
```

### Quick Try

Try mm without installation:

```sh
deno task exec workspace init my-workspace
deno task exec note "My first note"
deno task exec list
```

### Installation

For regular use, install mm globally:

```sh
deno task install
```

After installation, the `mm` command is available from anywhere:

```sh
mm workspace init my-workspace
mm note "My first note"
mm list
```

Alternatively, build a standalone binary with `deno task compile`.

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

#### Item ID References

Commands that operate on items accept the following identifier formats:

- **Full item IDs**: Complete UUID v7 identifiers (e.g., `01932e4a-1234-5678-9abc-def012345678`)
- **Aliases**: Human-readable aliases assigned to items (e.g., `meeting-notes`, `design-system`)

If an alias matches multiple items, the command will show an error listing the ambiguous matches.

#### Common Options

- `-w, --workspace <workspace>` - Override the active workspace for a single command

#### `close <ids...>`

Close one or more items (tasks/notes/events).

```sh
# Close by UUID
mm close 01932e4a-1234-5678-9abc-def012345678

# Close by alias
mm close task-a

# Close multiple items
mm close task-a task-b task-c
```

#### `reopen <ids...>`

Reopen one or more closed items.

```sh
# Reopen by UUID
mm reopen 01932e4a-1234-5678-9abc-def012345678

# Reopen by alias
mm reopen task-a

# Reopen multiple items
mm reopen task-a task-b
```

#### `move <ids...> <placement>`

Move one or more items to a new placement. Items maintain their physical location; only logical
placement changes. Alias: `mv`

```sh
# Move item to head of today
mm move task-a head:today
mm mv task-a head:today

# Move item to tail of today
mm mv task-b tail:today

# Move item after another item (by UUID)
mm mv 01932e4a-1234-5678-9abc-def012345678 after:01932e4a-5678-1234-abcd-ef0123456789

# Move item before another item (by alias)
mm mv task-a before:task-b

# Move to a different parent/section
mm mv task-c project-alpha/1

# Move to a specific date
mm mv task-a 2025-01-20

# Move multiple items (maintains order)
mm mv task-a task-b task-c head:today
```

Placement formats:

- `head:<path>` - Move to head (first position) of the target container
- `tail:<path>` - Move to tail (last position) of the target container
- `after:<item-id>` - Move after the specified item
- `before:<item-id>` - Move before the specified item
- `<path>` - Move to the target container (date or item alias)

When moving multiple items, they are placed in the order specified. The first item goes to the
target placement, and subsequent items are placed after the previous one.

#### `snooze <ids...> [until]`

Snooze items until a future datetime. Snoozed items are hidden from normal listing. Alias: `sn`

```sh
# Snooze with default duration (8 hours)
mm snooze task-a

# Snooze with explicit duration (by UUID)
mm snooze 01932e4a-1234-5678-9abc-def012345678 2h
mm sn task-b 30m

# Snooze until specific time (uses parent date)
mm snooze task-c 17:00

# Snooze until specific date and time
mm snooze task-a "2025-01-20T17:00"

# Clear snooze (unsnooze)
mm snooze task-a --clear
mm sn task-b -c
```

Options:

- `-c, --clear` - Clear snooze (unsnooze items)

Duration formats: `30m`, `2h`, `1h30m`

Datetime formats:

- ISO 8601 with timezone: `2025-01-20T17:00:00Z` or `2025-01-20T17:00:00+09:00`
- ISO 8601 local time: `2025-01-20T17:00` (interpreted as local time)
- Time only: `17:00` or `17:00:00` (uses parent placement date or today)

#### `remove <ids...>`

Permanently remove items from the workspace. Alias: `rm`

```sh
# Remove a single item by UUID
mm remove 01932e4a-1234-5678-9abc-def012345678

# Remove by alias
mm rm task-a

# Remove multiple items
mm remove task-a task-b task-c
```

### Navigation

mm provides Unix-like path navigation over your knowledge graph.

#### `cd [path]`

Change the current working location in the knowledge graph.

```sh
# Navigate to today
mm cd today

# Navigate to a specific date
mm cd 2025-01-20

# Navigate to an item by alias
mm cd meeting-notes

# Navigate to a section under an item
mm cd project-alpha/1

# Go to parent location
mm cd ..

# Navigate with no arguments shows current location
mm cd
```

#### `pwd`

Print the current working path.

```sh
mm pwd
```

#### `ls [path]`

List items at the current location or a specified path.

```sh
# List items at current location
mm ls

# List items at a specific path
mm ls today
mm ls 2025-01-20
mm ls project-alpha/1

# List all items including snoozed and closed ones
mm ls --all
mm ls -a

# List items in a date range
mm ls 2025-01-01..2025-01-07
```

Options:

- `-a, --all` - Show all items including snoozed and closed ones

#### `where <id>`

Show both logical and physical paths for an item.

```sh
# By UUID
mm where 01932e4a-1234-5678-9abc-def012345678

# By alias
mm where meeting-notes
```

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

To clone from an existing remote repository (e.g., from another machine):

```sh
mm workspace init my-workspace --remote https://github.com/username/my-workspace.git
```

Options:

- `-t, --timezone <iana-id>` – Timezone identifier for the new workspace (default: host timezone)
- `-r, --remote <url>` – Clone from a remote Git repository (HTTPS or SSH)
- `-b, --branch <branch>` – Branch to checkout when cloning (default: repository default)

#### `workspace use <name>`

Switch to an existing workspace. If the workspace is missing, it is created first using the
specified (or default) timezone.

```sh
mm workspace use research
mm ws use client-a --timezone Asia/Tokyo
```

### Configuration

#### `config [list|get|set]`

View and modify workspace settings.

```sh
mm config                              # List all settings
mm config get sync.mode                # Get a specific value
mm config set sync.mode auto-sync      # Set a value
```

Supported keys: `timezone`, `sync.enabled`, `sync.mode`, `sync.git.remote`, `sync.git.branch`,
`sync.git.noSign`, `sync.lazy.commits`, `sync.lazy.minutes`

### Git Synchronization

mm supports Git-based synchronization to backup and sync workspaces across devices. Two sync modes
are available:

- **auto-commit**: Automatically commits changes after each operation (manual push required)
- **auto-sync**: Automatically commits and pushes changes (configurable thresholds for batched sync)

#### `sync init <remote-url>`

Initialize Git sync for the workspace. This creates a Git repository, configures the remote, and
enables auto-commit mode (automatic commits after each operation, manual push required).

```sh
# Initialize with default branch (main)
mm sync init https://github.com/username/my-workspace.git

# Specify a custom branch
mm sync init git@github.com:username/my-workspace.git --branch develop

# Force overwrite existing remote configuration
mm sync init https://github.com/username/my-workspace.git --force
```

Options:

- `-b, --branch <branch>` - Branch to sync with (default: main)
- `-f, --force` - Force overwrite existing remote config

The command automatically creates a `.gitignore` file to exclude local state and cache files
(`.state.json`, `.index/`, `.tmp/`).

#### `sync push`

Push local commits to the remote repository.

```sh
# Push commits to remote
mm sync push

# Force push (use with caution)
mm sync push --force
```

Options:

- `-f, --force` - Force push to remote

#### `sync pull`

Pull changes from the remote repository. Requires a clean working tree (no uncommitted changes).

```sh
mm sync pull
```

#### `sync`

Execute both pull and push operations in sequence.

```sh
mm sync
```

**Note**: In auto-commit mode, changes are committed locally but not pushed automatically. Use
`mm sync push` or `mm sync` to push commits to the remote. In auto-sync mode, changes are
automatically committed and pushed after each operation.

**Sync Mode Configuration**: The sync mode defaults to `auto-commit`. To change it:

```sh
mm config set sync.mode auto-sync      # Sync after every operation (default: immediate)
```

**Auto-sync Threshold Configuration**: By default, auto-sync pushes immediately after each commit.
You can configure thresholds for batched sync:

```sh
mm config set sync.lazy.commits 10     # Sync after 10 commits (default: 1)
mm config set sync.lazy.minutes 10     # Sync after 10 minutes (default: 0, disabled)
```

**Commit Signing**: By default, mm respects your Git signing configuration. To skip GPG/SSH signing
for mm's automated commits (useful when signing requires passphrase interaction):

```sh
mm config set sync.git.noSign true
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
