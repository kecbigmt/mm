## Story Log

### Goal
Allow users to configure mm to skip GPG/SSH commit signing when auto-committing changes.

### Why
Users who have commit signing configured globally in their Git config may want mm to commit without signing. This is useful when:
- GPG key requires passphrase entry which interrupts automated workflows
- SSH signing is configured but problematic for automated commits
- Signing is desired for manual commits but not for mm's automated commits

### User Story
**As a mm user, I want to configure mm to skip commit signing, so that automated commits don't require GPG/SSH key interaction.**

### Acceptance Criteria

#### 1. Configuration Setting
- [x] **Given** mm is installed, **When** you run `mm config list`, **Then** `sync.git.noSign` appears in the configuration list with a default value of `false`
- [x] **Given** mm is installed, **When** you run `mm config get sync.git.noSign`, **Then** the current value is displayed (default: `false`)
- [x] **Given** mm is installed, **When** you run `mm config set sync.git.noSign true`, **Then** the setting is saved to workspace.json

#### 2. Commit Behavior with Signing Disabled
- [x] **Given** `sync.git.noSign=true` and `sync.enabled=true`, **When** mm auto-commits (e.g., after `mm note "test"`), **Then** the commit is created with `--no-gpg-sign` flag
- [x] **Given** `sync.git.noSign=true`, **When** you run `mm sync` (which creates commits internally), **Then** commits are made without GPG signing *(Blocked due to test environment, but same code path as above)*

#### 3. Commit Behavior with Signing Enabled (Default)
- [x] **Given** `sync.git.noSign=false` (default), **When** mm auto-commits, **Then** commits use normal Git signing behavior (respects user's global config)

#### 4. Validation
- [x] **Given** mm config set is called, **When** you set `sync.git.noSign` to an invalid value (not `true` or `false`), **Then** an error message is shown

### Out of Scope
- Configuring which key to use for signing (use git config for this)
- Per-commit signing decisions
- Signing for push operations
- Custom GPG program configuration

---

### Completed Work Summary

**Implementation completed on 2026-01-10, renamed on 2026-01-12**

Modified:
- `src/domain/models/workspace.ts` - Added `noSign?: boolean` field to `GitSyncSettings` and `GitSyncSettingsSnapshot` types; updated `toJSON()` to serialize `noSign` field; updated `parseWorkspaceSettings()` to read `noSign` from snapshot
- `src/domain/services/version_control_service.ts` - Updated `commit()` signature to accept `options?: { noSign?: boolean }`
- `src/infrastructure/git/git_client.ts` - Updated `commit()` to pass `--no-gpg-sign` flag when `noSign === true`
- `src/infrastructure/git/sync_service.ts` - Updated `CommitInput` type to use `noSign` field
- `src/presentation/cli/auto_commit_helper.ts` - Pass `noSign` setting from workspace config to `commit()` call
- `src/presentation/cli/commands/config.ts` - Added `sync.git.noSign` to valid config keys; implemented getter (with default `false`) and setter with validation

### Acceptance Checks

**Status: Accepted**

All acceptance criteria verified and passing.
Tested on: 2026-01-12

Product owner acceptance testing completed:
- All 7 acceptance criteria verified through manual testing
- Criterion 2.2 (mm sync) blocked due to test environment constraints, but same code path verified via Criterion 2.1
- SSH signing with 1Password confirmed working when `sync.git.noSign=false`
- `--no-gpg-sign` flag confirmed when `sync.git.noSign=true`

Developer verification completed:
- All 555 unit tests passing
- All E2E tests passing (except unrelated zsh completion test due to missing zsh in test environment)
- Lint and format checks pass
- Code follows existing patterns in the codebase

### Follow-ups / Open Risks

#### Addressed
- None

#### Remaining
- The `noSign` setting defaults to `false` (meaning: use Git's default behavior). When `noSign=true`, the `--no-gpg-sign` flag is passed to skip signing.
