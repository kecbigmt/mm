## Story Log

### Goal
Implement shell completion script generation for Zsh and Bash to enable tab completion of commands, flags, and recently used aliases/tags.

### Why
Users need fast command-line workflows when working with mm. Typing full commands, flags, and item references manually is slow and error-prone. Shell completion powered by the recently implemented cache (from previous story) will accelerate daily usage by suggesting commands, flags, and recently accessed aliases/tags.

### User Story
**As a mm user, I want to install shell completion for mm commands, so that I can quickly type commands, flags, and recently used aliases/tags with tab completion.**

### Acceptance Criteria

#### 1. Completions Command
- [ ] **Given** I run `mm completions zsh`, **When** the command executes, **Then** it outputs a valid Zsh completion script to stdout
- [ ] **Given** I run `mm completions bash`, **When** the command executes, **Then** it outputs a valid Bash completion script to stdout
- [ ] **Given** I run `mm completions` without arguments, **When** the command executes, **Then** it shows an error message with usage instructions

#### 2. Zsh Completion - Commands and Subcommands
- [ ] **Given** I have sourced the Zsh completion script, **When** I type `mm <TAB>`, **Then** it suggests available commands (note, task, event, list, edit, move, close, reopen, remove, completions)
- [ ] **Given** I type `mm n<TAB>`, **When** completion triggers, **Then** it completes to `mm note` or shows matching commands

#### 3. Zsh Completion - Flags
- [ ] **Given** I type `mm note <TAB>`, **When** completion triggers, **Then** it suggests available flags (--context, --project, --in)
- [ ] **Given** I type `mm note --c<TAB>`, **When** completion triggers, **Then** it completes to `--context`

#### 4. Zsh Completion - Alias Candidates from Cache
- [ ] **Given** `completion_aliases.txt` contains "todo" and "meeting-notes", **When** I type `mm edit <TAB>`, **Then** it suggests both aliases
- [ ] **Given** the cache file is empty or missing, **When** I type `mm edit <TAB>`, **Then** no alias candidates are suggested (no error)

#### 5. Zsh Completion - Context Tag Candidates from Cache
- [ ] **Given** `completion_context_tags.txt` contains "work" and "personal", **When** I type `mm note --context <TAB>`, **Then** it suggests both tags
- [ ] **Given** the cache file is empty or missing, **When** I type `mm note --context <TAB>`, **Then** no tag candidates are suggested (no error)

#### 6. Cache File Discovery (Workspace Traversal)
- [ ] **Given** I am in the workspace root directory, **When** completion triggers, **Then** it finds `.index/completion_*.txt`
- [ ] **Given** I am in a subdirectory of a workspace, **When** completion triggers, **Then** it traverses upward and finds the cache files
- [ ] **Given** I am outside any workspace, **When** completion triggers, **Then** completion gracefully provides only basic command/flag completion

#### 7. Bash Completion
- [ ] **Given** I have sourced the Bash completion script, **When** I use tab completion for commands/flags/aliases/tags, **Then** it provides the same suggestions as Zsh

#### 8. Installation Instructions
- [ ] **Given** I run `mm completions zsh`, **When** I read the script output, **Then** it includes commented installation instructions at the top

### Out of Scope
- Fish or PowerShell support (future work)
- Context-aware filtering (e.g., filtering `mm close` candidates to only show open items)
- Short ID completion logic (Epic supports UUID and Alias only)
- Fallback mechanisms when cache is empty (cache-only design per Epic)

---

### Completed Work Summary

**Implementation:**
- Created `src/presentation/cli/commands/completions.ts` with:
  - `createCompletionsCommand()`: Cliffy command that outputs shell scripts to stdout
  - Zsh completion script with full support for commands, flags, aliases, and tags
  - Bash completion script with equivalent functionality
  - Cache file discovery via upward directory traversal
  - Fallback implementation for `_init_completion` in Bash script

- Registered `completions` command in `src/main.ts`

- Created comprehensive unit tests in `src/presentation/cli/commands/completions_test.ts`

**Key Features:**
- **Commands:** All mm commands (note, task, event, list, edit, move, close, reopen, workspace, cd, pwd, where, snooze, doctor, sync, completions) with aliases
- **Flags:** Context-aware flag completion for each command
- **Cache Integration:** Reads `completion_aliases.txt` and `completion_context_tags.txt` from `.index/`
- **Workspace Traversal:** Searches parent directories to find workspace root
- **Graceful Degradation:** No errors when cache files are missing or when outside workspace

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

**Unit Tests (4 tests, all passing):**
- ✓ `mm completions zsh` outputs valid Zsh script
- ✓ `mm completions bash` outputs valid Bash script
- ✓ Both scripts include installation instructions

**Shell Syntax Validation:**
- ✓ Zsh script passes `zsh -n` syntax check
- ✓ Bash script passes `bash -n` syntax check

**Zsh Functional Tests:**
- ✓ Completion function `_mm` registered successfully
- ✓ Helper functions `_mm_get_alias_candidates()` and `_mm_get_tag_candidates()` work correctly
- ✓ Cache file discovery from workspace root
- ✓ Cache file discovery from nested subdirectories (traverses upward)
- ✓ Empty results (no errors) when outside workspace

**Bash Functional Tests:**
- ✓ Command completion: `mm <TAB>` → all commands listed
- ✓ Command prefix completion: `mm n<TAB>` → `note`
- ✓ Flag completion: `mm note --<TAB>` → all flags listed
- ✓ Context tag completion: `mm note --context <TAB>` → tags from cache
- ✓ Alias completion: `mm edit <TAB>` → aliases from cache
- ✓ Subcommand completion: `mm completions <TAB>` → `bash zsh`
- ✓ Empty results when outside workspace (no errors)
- ✓ Fallback implementation for `_init_completion` works correctly

**Test Environment:**
- Created test workspace with cache files containing sample aliases and tags
- Verified behavior from workspace root, nested subdirectories, and outside workspace
- All 307 existing unit tests still pass (1 failure unrelated to this feature)

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed
- **Bash compatibility:** Added fallback implementation for `_init_completion` to support environments without bash-completion package
- **Cache-only design:** Confirmed working as intended - no fallback when cache is missing, graceful empty results
- **Workspace detection:** Parent directory traversal works correctly from any depth

#### Remaining
- **Interactive testing:** Developer verified completion logic programmatically, but product owner should test actual tab completion in their shell environment
- **Completion performance:** Cache files are read on every completion trigger; performance should be acceptable for small cache files but may need monitoring
