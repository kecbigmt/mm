## Story Log

### Goal
Improve `mm ls` output for item-head placements: suppress `/0` header and inline section contents.

### Why
When cwd is an item head (e.g. `mm cd modeless-design`), `mm ls` currently shows:
- A partition header like `[modeless-design/0]` even though no section `/0` was explicitly created
- Section stubs like `📁 386/ (items: 1, sections: 0)` without showing the items inside them

This forces the user to manually `mm ls 386/` for each section to see its contents, making the overview less useful.

### User Story
**As a mm user, I want `mm ls` under an item head to omit the `/0` header and show items inside sections up to a configurable depth, so that I get a useful overview without extra navigation.**

### Acceptance Criteria

#### 1. Suppress `/0` header for item-head single placement
- [ ] **Given** cwd is an item head (e.g. `permanent/modeless-design`), **When** you run `mm ls`, **Then** the partition header shows `[modeless-design]` (no `/0` suffix)
- [ ] **Given** cwd is an item head with sections, **When** you run `mm ls` in print mode (`-p`), **Then** the header also omits `/0`

#### 2. Inline section contents (depth expansion)
- [ ] **Given** cwd is an item head with sections containing items, **When** you run `mm ls`, **Then** items inside each section are displayed under a section header (e.g. `📁 386/` followed by its items indented)
- [ ] **Given** cwd is an item head with nested sections (sections inside sections), **When** you run `mm ls`, **Then** only 1 level of section contents is expanded by default (deeper sections shown as stubs)
- [ ] **Given** cwd is an item head with sections, **When** you run `mm ls -d 2` (or `--depth 2`), **Then** 2 levels of section contents are expanded
- [ ] **Given** cwd is an item head with sections, **When** you run `mm ls -d 0`, **Then** no section contents are expanded (current behavior: stubs only)

#### 3. Backward compatibility
- [ ] **Given** cwd is a date directory, **When** you run `mm ls`, **Then** output is unchanged (no depth expansion for date ranges)
- [ ] **Given** a numeric range expression (e.g. `mm ls book/1..3`), **When** you run `mm ls`, **Then** output is unchanged

#### 4. Error Cases
- [ ] **Given** a negative depth value, **When** you run `mm ls -d -1`, **Then** an error message is shown

### Verification Approach
CLI commands: run `mm ls` with cwd set to an item head and verify output format. Use `mm ls -p` for machine-readable verification. Unit tests for partition building and formatting.

### Out of Scope
- Depth expansion for date range listings
- Depth expansion for numeric range listings
- Changing the section stub format itself
- Recursive unlimited depth (cap at reasonable max)

---

### Completed Work Summary
Not yet started.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:
- [List what the developer manually verified]
- [Note any observations or findings]

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- (none yet)

#### Remaining
- Depth expansion requires querying items for each section, which may impact performance for item heads with many sections
- Consider whether depth option should also apply to numeric range listings in the future
