## Story Log

### Goal
Implement `mm workspace init <name> --remote <url>` to create a local workspace by cloning an existing remote Git repository.

### Why
Users who already have a workspace synced to a remote repository (e.g., from another machine) need a way to set up a new local workspace from that remote. Currently, `mm workspace init` only creates empty workspaces, and `mm sync init` only configures Git for existing local workspaces.

### User Story
**As a** mm user with an existing remote workspace repository, **I want** to initialize a local workspace from a remote URL with `mm workspace init <name> --remote <url>`, **so that** I can quickly set up my workspace on a new machine with all my existing data.

### Acceptance Criteria

#### 1. Command Execution & Repository Cloning
- [x] **Given** a valid remote URL and workspace name, **When** I run `mm workspace init <name> --remote <url>`, **Then** the remote repository is cloned into `~/.mm/<name>/`.
- [x] **Given** an HTTPS URL (e.g., `https://github.com/<owner>/<repo>.git`), **When** I run the command, **Then** the repository is cloned successfully.
- [x] **Given** an SSH URL (e.g., `git@github.com:<owner>/<repo>.git`), **When** I run the command, **Then** the repository is cloned successfully.
- [x] **Given** a remote URL, **When** cloning succeeds, **Then** the remote `origin` is already configured (inherited from clone).
- [x] **Given** a remote with a non-default branch, **When** I run `mm workspace init <name> --remote <url> --branch <branch>`, **Then** the specified branch is checked out.
- [x] **Given** a successful clone, **When** workspace is created, **Then** `workspace.json` from the remote is preserved (not modified).

#### 2. Workspace Registration
- [x] **Given** a successful clone, **When** I run `mm workspace list`, **Then** the new workspace appears in the list.
- [x] **Given** a successful clone, **Then** the new workspace is set as the current workspace.

#### 3. Index Rebuild
- [x] **Given** a successful clone with existing items, **When** workspace is created, **Then** the `.index/` is rebuilt from the cloned items.

#### 4. Error Cases
- [x] **Given** a workspace name that already exists, **When** I run the command, **Then** it fails with error "Workspace '<name>' already exists."
- [x] **Given** an invalid remote URL, **When** I run the command, **Then** it fails with a clear error message.
- [x] **Given** a remote URL that doesn't exist or is inaccessible, **When** I run the command, **Then** Git's error message is displayed.
- [x] **Given** an invalid branch name, **When** I run with `--branch`, **Then** it returns a validation error.
- [x] **Given** clone fails, **When** error occurs, **Then** no partial workspace directory is left behind (cleanup).

### Verification Approach
- Direct CLI command execution for all acceptance criteria
- E2E tests for automated verification

### Out of Scope
- Authentication handling (relies on user's system git auth).
- Creating a new remote repository (user must have an existing repo).
- Conflict resolution during clone (standard Git behavior).

---

### Completed Work Summary

**Implementation completed:**

1. **VersionControlService.clone()** - Added `clone` method to the version control service interface and Git implementation
   - Supports basic clone: `git clone <url> <path>`
   - Supports branch option: `git clone --branch <branch> <url> <path>`

2. **WorkspaceInitRemoteWorkflow** - New domain workflow for initializing workspace from remote
   - Validates workspace name doesn't already exist
   - Clones remote repository to workspace path
   - Sets cloned workspace as current
   - Cleans up on failure (removes partial directory)

3. **CLI Command** - Added `--remote` and `--branch` options to `mm workspace init`
   - `mm workspace init <name> --remote <url>` clones from remote
   - `mm workspace init <name> --remote <url> --branch <branch>` clones specific branch
   - Rebuilds index after successful clone

**Test coverage:**
- Unit tests for `VersionControlService.clone()` (git_client_test.ts)
- Unit tests for `WorkspaceInitRemoteWorkflow` (workspace_init_remote_test.ts)

### Acceptance Checks

**Status: Accepted**

All acceptance criteria verified and passing.
Tested on: 2025-12-22

Product owner acceptance testing (using https://github.com/kecbigmt/mm-workspace):
- 1.1 Clone with valid remote URL: ✅ Pass
- 1.2 HTTPS URL clone: ✅ Pass
- 1.3 SSH URL clone: ✅ Pass
- 1.4 Remote origin configured: ✅ Pass
- 1.5 --branch option: ✅ Pass
- 1.6 workspace.json preserved: ✅ Pass
- 2.1 Workspace appears in list: ✅ Pass
- 2.2 Set as current workspace: ✅ Pass
- 3.1 Index rebuild: ✅ Pass (77 items, 77 edges, 77 aliases)
- 4.1 Error - workspace exists: ✅ Pass
- 4.2 Error - invalid remote URL: ✅ Pass
- 4.3 Error - inaccessible remote: ✅ Pass
- 4.4 Error - invalid branch name: ✅ Pass
- 4.5 Cleanup on failure: ✅ Pass

### Follow-ups / Open Risks

#### Addressed
- (none yet)

#### Remaining
- (none yet)

---

### Implementation Notes

#### Workflow
1. Validate workspace name doesn't already exist
2. Validate remote URL format
3. Clone remote repository to `~/.mm/<name>/`
4. If `--branch` specified, checkout that branch
5. Rebuild `.index/` from cloned items
6. Register workspace as current

#### Key Differences from `mm sync init`
- `mm sync init`: Initializes Git in an **existing** local workspace
- `mm workspace init --remote`: **Creates** a new workspace by cloning from remote

#### Git Commands
```sh
git clone <url> <path>
git clone --branch <branch> <url> <path>  # if branch specified
```

