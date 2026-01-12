## Story Log

### Goal
Refactor item display to use Bullet Journal-style type symbols and separate status indicators.

### Why
The current design has two problems:
1. The `✔️` emoji for uncompleted tasks misleads AI into thinking tasks are completed
2. The design requires defining emojis for each type×status combination, which doesn't scale

Solution: Use Bullet Journal-style symbols where open items show type (`•` `-` `○`) and closed/snoozing items show status (`×` `~`). This keeps lists scannable and aligned.

Related issue: `tiri-qrk` - "task emojiがAIに完了済みと誤解させてしまう"

### User Story
**As a user (human or AI) of mm CLI, I want items to display with clear Bullet Journal-style symbols, so that I can quickly scan and understand what needs attention.**

### New Display Format

**Type symbols (Bullet Journal style, shown when open):**
| Type | Symbol |
|------|--------|
| task | `•` |
| note | `-` |
| event | `○` |

**Status symbols (replaces type symbol when not open):**
| Status | Symbol |
|--------|--------|
| open | (type symbol) |
| closed | `×` |
| snoozing | `~` |

**ls format:** `<symbol> [time?] <id> <title> ...`

**show format:**
```
<id> <title>
<type>:<status> +<project> @<context> on:<date>
```

### Acceptance Criteria

#### 1. Task Display
- [ ] **Given** an open task, **When** I run `mm ls`, **Then** it displays as `• <id> <title> ...`
- [ ] **Given** a closed task, **When** I run `mm ls`, **Then** it displays as `× <id> <title> ...`
- [ ] **Given** a snoozing task, **When** I run `mm ls --all`, **Then** it displays as `~ <id> <title> ...`

#### 2. Note Display
- [ ] **Given** an open note, **When** I run `mm ls`, **Then** it displays as `- <id> <title> ...`
- [ ] **Given** a closed note, **When** I run `mm ls`, **Then** it displays as `× <id> <title> ...`

#### 3. Event Display
- [ ] **Given** an open event without time, **When** I run `mm ls`, **Then** it displays as `○ <id> <title> ...`
- [ ] **Given** an open event with start time, **When** I run `mm ls`, **Then** it displays as `○ (HH:MM) <id> <title> ...`
- [ ] **Given** an open event with duration, **When** I run `mm ls`, **Then** it displays as `○ (HH:MM-HH:MM) <id> <title> ...`
- [ ] **Given** a closed event, **When** I run `mm ls`, **Then** it displays as `× <id> <title> ...`

#### 4. Show Command
- [ ] **Given** any item, **When** I run `mm show <id>`, **Then** it displays two-line header with `<type>:<status>`

#### 5. Print Mode
- [ ] **Given** any item, **When** I run `mm ls --print`, **Then** it displays plain text tokens (e.g., `[task]`, `[task:done]`, `[task:snoozing]`)

### Verification Approach
- Direct CLI execution of `mm ls` and `mm show` commands
- Unit tests for `formatItemIcon` function
- E2E tests for ls/show command output

### Out of Scope
- (none)

---

### Completed Work Summary

**Changed files:**
- `src/domain/primitives/item_status.ts` - Added `snoozing` status with `isSnoozing()` method
- `src/domain/primitives/mod.ts` - Export `itemStatusSnoozing`
- `src/domain/models/item.ts` - `snooze()` now sets status to `snoozing`/`open`
- `src/presentation/cli/formatters/list_formatter.ts` - Bullet Journal symbols (`•` `-` `○` `×` `~`)
- `src/presentation/cli/formatters/list_formatter_test.ts` - Updated tests
- `src/presentation/cli/formatters/item_detail_formatter.ts` - Two-line header with `type:status`
- `src/presentation/cli/formatters/item_detail_formatter_test.ts` - Updated tests

**Implementation:**
- `formatItemIcon`: Returns type symbol (`•` `-` `○`) when open, `×` when closed, `~` when snoozing
- `formatEventTime`: Uses `○` with time instead of `🕒`
- `formatItemDetail`: Two-line header (`alias title` + `type:status metadata`)
- `ItemStatus`: Added `"snoozing"` value and `isSnoozing()` method
- `Item.snooze()`: Sets status to `snoozing` when snoozeUntil is set, `open` when cleared

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- `mm ls`: open task `•`, open note `-`, closed `×`, snoozing `~`
- `mm show <id>`: two-line header with `task:open`, `task:closed`, `task:snoozing`
- `mm ls --print`: `[task]`, `[task:done]`, `[task:snoozing]`
- Unit tests: 549 passed
- Lint/format: passed

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- Snoozed status implemented (originally planned as future work)

#### Remaining
- (none)
