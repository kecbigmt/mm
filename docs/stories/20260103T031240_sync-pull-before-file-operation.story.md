# Story: Execute sync pull before file operations instead of after

**Status:** Draft
**Created:** 2026-01-03T03:12:40
**Reference:** mm task yoni-0h6

## User Story

As a user syncing across multiple devices,
I want mm to pull remote changes before performing file operations,
So that I minimize conflicts when editing existing items.

## Background

When sync mode is `lazy-sync` or `auto-sync`, the current sync flow is:

```
AsIs: File operation → pull → commit → push
```

This ordering can cause conflicts when editing existing items (e.g., `mm edit`) because local changes are written before remote changes are fetched.

The proposed change:

```
ToBe: pull → File operation → commit → push
```

By pulling first, remote changes are incorporated before local file operations, reducing the likelihood of conflicts.

## Acceptance Criteria

### 1. Pull Before File Operations

- [ ] **Given** sync mode is `auto-sync` and remote is configured, **When** you run a state-changing command (e.g., `mm edit`), **Then** mm pulls from remote before performing the file operation
- [ ] **Given** sync mode is `lazy-sync` and remote is configured, **When** you run a state-changing command, **Then** mm pulls from remote before performing the file operation
- [ ] **Given** sync mode is `auto-commit`, **When** you run a state-changing command, **Then** mm does NOT pull before the file operation (no sync behavior)

### 2. Commit and Push After File Operations

- [ ] **Given** pull succeeded before file operation, **When** the file operation completes, **Then** mm commits and pushes as before
- [ ] **Given** pull succeeded and file operation completes, **When** push is performed, **Then** conflicts are less likely because local files are up-to-date

### 3. Error Handling

- [ ] **Given** pull fails due to network error, **When** running a state-changing command, **Then** the file operation proceeds with a warning
- [ ] **Given** pull fails due to rebase conflict, **When** running a state-changing command, **Then** the file operation proceeds with a warning (not blocked)
- [ ] **Given** remote is not configured, **When** running a state-changing command, **Then** the file operation proceeds without pull

### 4. Affected Commands

State-changing commands that should trigger pre-pull:
- [ ] `mm task` / `mm note` / `mm event` (create)
- [ ] `mm edit` (update)
- [ ] `mm close` / `mm reopen` (status change)
- [ ] `mm remove` (delete)

## Verification Approach

- Unit tests for the new pre-sync workflow
- E2E tests simulating multi-device sync scenarios
- Manual testing with actual remote repository

## Technical Notes

- Pre-pull displays loading indicator (same as post-sync)
- Performance: latency is acceptable for `auto-sync` users; users who prefer speed can use `lazy-sync` or `auto-commit`

## Out of Scope

- Background/async sync (pull happens synchronously before operation)
- Automatic conflict resolution
- Changes to `auto-commit` mode behavior

---

### Completed Work Summary

Not yet started.

### Acceptance Checks

**Status: Pending Implementation**

### Follow-ups / Open Risks

#### Addressed

- Performance impact: Acceptable for `auto-sync`; speed-conscious users can choose `lazy-sync` or `auto-commit`
- Loading indicator: Will be shown during pre-pull

#### Remaining

- Edge case: what if pull succeeds but local file was modified externally?
