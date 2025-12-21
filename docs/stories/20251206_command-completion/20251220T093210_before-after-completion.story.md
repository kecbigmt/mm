## Story Log

### Goal
Enable tab completion for item aliases after `before:`, `after:`, `head:`, and `tail:` prefixes in the `mm mv` command.

### Why
Users need to move items relative to other items using commands like `mm mv item-a before:item-b`. Currently, tab completion doesn't work after the colon in `before:`, `after:`, `head:`, or `tail:` prefixes, making it cumbersome to type item references. Enabling completion for these prefixes will improve user experience and reduce typing errors.

### User Story
**As a mm user, I want tab completion to suggest item aliases after typing `before:`, `after:`, `head:`, or `tail:` in the move command, so that I can quickly reference items without typing their full aliases.**

### Acceptance Criteria

#### 1. Zsh Completion
- [x] **Given** Zsh completion is installed, **When** you type `mm mv item-a before:<TAB>`, **Then** alias candidates are suggested after the `before:` prefix
- [x] **Given** Zsh completion is installed, **When** you type `mm mv item-a after:<TAB>`, **Then** alias candidates are suggested after the `after:` prefix
- [x] **Given** Zsh completion is installed, **When** you type `mm mv item-a head:<TAB>`, **Then** alias candidates are suggested after the `head:` prefix
- [x] **Given** Zsh completion is installed, **When** you type `mm mv item-a tail:<TAB>`, **Then** alias candidates are suggested after the `tail:` prefix
- [x] **Given** Zsh completion is installed, **When** you type `mm mv item-a before:ite<TAB>` with a partial alias, **Then** matching aliases are filtered and suggested

#### 2. Bash Completion
- [x] **Given** Bash completion is installed, **When** you type `mm mv item-a before:t<TAB>` with at least one character after the prefix, **Then** alias candidates are suggested with the `before:` prefix
- [x] **Given** Bash completion is installed, **When** you type `mm mv item-a after:t<TAB>` with at least one character after the prefix, **Then** alias candidates are suggested with the `after:` prefix
- [x] **Given** Bash completion is installed, **When** you type `mm mv item-a head:t<TAB>` with at least one character after the prefix, **Then** alias candidates are suggested with the `head:` prefix
- [x] **Given** Bash completion is installed, **When** you type `mm mv item-a tail:t<TAB>` with at least one character after the prefix, **Then** alias candidates are suggested with the `tail:` prefix
- [x] **Given** Bash completion is installed, **When** you type `mm mv item-a before:test-item-<TAB>` with a partial alias, **Then** matching aliases are filtered and suggested

#### 3. Backward Compatibility
- [x] **Given** existing completion functionality, **When** you use tab completion for other commands, **Then** they continue to work as before
- [x] **Given** the move command without prefixes, **When** you type `mm mv item-a <TAB>`, **Then** alias candidates are suggested normally

### Out of Scope
- Completion for other positioning prefixes beyond `before:`, `after:`, `head:`, `tail:`
- Context-aware filtering (e.g., only suggesting open items after `before:`)
- Completion for other commands beyond `mv`/`move`

---

### Completed Work Summary

#### Implementation
Updated shell completion scripts in `src/presentation/cli/commands/completions.ts` to handle positioning prefixes in the `mm mv` command:

1. **Zsh Completion (lines 181-217)**:
   - Added prefix detection logic that checks if the current word starts with `before:`, `after:`, `head:`, or `tail:`
   - When a prefix is detected, uses `compadd -P "$prefix"` to add the prefix to completion candidates
   - Falls back to normal alias completion when no prefix is present

2. **Bash Completion (lines 418-454)**:
   - Added prefix detection logic for move/mv commands
   - When a prefix is detected, constructs prefixed candidates by prepending the prefix to each alias
   - Uses `compgen` with the prefixed candidates list to provide completions

#### Technical Approach
- Zsh: Uses `compadd -P` flag to add prefix automatically, which provides cleaner integration with Zsh's completion system
- Bash: Manually constructs prefixed candidates since Bash's `compgen` doesn't have an equivalent prefix flag

#### Test Results
- All 7 completion unit tests passed
- All 2 e2e completion tests passed (zsh and bash registration)
- Total: 347/348 tests passed (1 pre-existing git signing failure unrelated to completion changes)

### Acceptance Checks

**Status: ✅ Accepted (2025-12-21)**

Product owner acceptance testing completed:

**AC.1 (Zsh Completion)**: ✅ All criteria met
- [x] `before:<TAB>` - alias candidates suggested
- [x] `after:<TAB>` - alias candidates suggested
- [x] `head:<TAB>` - alias candidates suggested
- [x] `tail:<TAB>` - alias candidates suggested
- [x] `before:ite<TAB>` - partial matching works

**AC.2 (Bash Completion)**: ✅ All criteria met (with shell-specific behavior)
- [x] `before:t<TAB>` - alias candidates suggested (requires at least one char after colon)
- [x] `after:t<TAB>` - alias candidates suggested (requires at least one char after colon)
- [x] `head:t<TAB>` - alias candidates suggested (requires at least one char after colon)
- [x] `tail:t<TAB>` - alias candidates suggested (requires at least one char after colon)
- [x] `before:test-item-<TAB>` - partial matching works

**AC.3 (Backward Compatibility)**: ✅ All criteria met
- [x] Other commands continue to work as before
- [x] Move command without prefixes works normally

**Developer verification:**
- Generated and inspected both Zsh and Bash completion scripts to verify prefix handling logic is present
- Verified completion scripts include the new prefix detection code for `before:`, `after:`, `head:`, and `tail:`
- All completion-related tests pass (unit and e2e)
- No regressions in existing completion functionality (other commands continue to work)
- Generated completion scripts are syntactically valid shell scripts

### Manual Testing Instructions for Product Owner

To test this feature, follow these steps:

1. **Setup**:
   ```bash
   # Generate and source the completion script (Zsh example)
   source <(mm completions zsh)

   # Or for Bash:
   source <(mm completions bash)
   ```

2. **Create some test items** (to populate the completion cache):
   ```bash
   mm note "Test item A" --alias item-a
   mm note "Test item B" --alias item-b
   mm note "Test item C" --alias item-c
   mm ls  # This populates the completion cache
   ```

3. **Test tab completion**:

   **For Zsh:**
   - Type `mm mv item-a before:<TAB>` and verify that `item-b` and `item-c` appear as suggestions
   - Type `mm mv item-a before:item-<TAB>` and verify that `item-b` and `item-c` are filtered and suggested
   - Type `mm mv item-a after:<TAB>` and verify completions work
   - Type `mm mv item-a head:<TAB>` and verify completions work
   - Type `mm mv item-a tail:<TAB>` and verify completions work
   - Type `mm mv item-a <TAB>` (without prefix) and verify normal completion still works

   **For Bash:**
   - Type `mm mv item-a before:i<TAB>` (need at least one char after colon) and verify completions work
   - Type `mm mv item-a before:item-<TAB>` and verify that `item-b` and `item-c` are filtered and suggested
   - Type `mm mv item-a after:i<TAB>` and verify completions work
   - Type `mm mv item-a head:t<TAB>` and verify completions work
   - Type `mm mv item-a tail:t<TAB>` and verify completions work
   - Type `mm mv item-a <TAB>` (without prefix) and verify normal completion still works

### Follow-ups / Open Risks

#### Addressed
- Initial concern about compatibility with existing completion behavior was resolved by ensuring backward compatibility for commands without prefixes

#### Shell-specific Behavior Differences
- **Bash**: Due to Bash's default `COMP_WORDBREAKS` including `:`, completion requires at least one character after the colon (e.g., `before:t<TAB>` works, but `before:<TAB>` alone does not trigger completion). This is standard Bash behavior for colon-separated values (similar to `ssh user@host:`, `git remote add origin https:`).
- **Zsh**: Completion works immediately after the colon without additional characters (e.g., `before:<TAB>` works).

#### Remaining
- The completion only suggests items that are in the cache; newly created items won't appear until a command like `mm ls` is run to populate the cache
- No context-aware filtering (e.g., filtering to only open items or items in specific placements) - this was explicitly marked as out of scope
- The prefix detection uses simple string matching; if users type invalid prefixes (e.g., `beforre:`), no special handling occurs (falls back to normal completion)
- Consider adding automated tests specifically for prefix completion behavior in the future (current tests verify script generation but not completion behavior itself)
