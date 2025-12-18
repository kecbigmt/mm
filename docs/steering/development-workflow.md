# Development Workflow

**Role**: This document defines the development **workflow**—the step-by-step process for implementing features using Story-driven Development. For document **structure**, file naming, and templates, see `docs/AGENTS.md`.

---

mm follows a user-story-driven approach organized around Epics and Stories to ensure every change delivers user value.

---

## Story Development Process

### 1. Define a User Story

Create a small, user-focused story:
* Format: "As a [role], I want [capability], so that [benefit]"
* Keep scope minimal but meaningful
* Focus on user-visible behavior, not implementation details

Example:
```
As a mm user, I want `mm sync init` to initialize my workspace as a Git repository
and configure the remote, so that I can start syncing my notes to GitHub.
```

### 2. Write Acceptance Criteria (Given-When-Then)

Define testable acceptance criteria using Given-When-Then format:
* **Given**: preconditions (initial state)
* **When**: action to perform
* **Then**: expected result

Example:
```
- [ ] Given a workspace without Git, When you run `mm sync init <remote-url>`,
      Then a Git repository is initialized in ~/.mm/<workspace>/
- [ ] Given `mm sync init` has completed, When you check workspace.json,
      Then it contains git.enabled=true and the configured remote URL
```

Guidelines:
* Focus on user-observable behavior, not implementation
* Include both happy paths and error cases
* Leave checkboxes unchecked initially (product owner will check them during acceptance)

**Review with Product Owner:**
* Confirm user story and acceptance criteria with product owner
* Clarify ambiguities and revise before implementation

### 3. Create a Story Log

Create a new story document following the instructions in `docs/AGENTS.md`:
* Use UTC timestamp for filename
* Place in appropriate location (epic directory or standalone)
* Copy and fill in `docs/stories/STORY_TEMPLATE.md`

### 4. Implement

Follow the inner loop workflow (below) to implement the story:
* Work in small steps
* Build incrementally
* Verify behavior as you go

Update the story log's "Completed Work Summary" section with:
* What was implemented
* Key design decisions
* Build/test results

### 5. Developer Verification

Before handing off to the product owner:
* Manually test all acceptance criteria
* Verify error cases
* Ensure existing functionality still works
* Update story log with verification notes
* **Do not check acceptance criteria checkboxes** (product owner does this)

### 6. Product Owner Acceptance Testing

The product owner:
* Tests all acceptance criteria in Given-When-Then format
* Checks each criterion's checkbox upon verification
* Provides feedback on any failing criteria
* Approves story completion when all criteria pass

### 7. Commit & Push

Once accepted:
* Follow the "Commit & Pull Request Guidelines" in root AGENTS.md
* Reference the story log if helpful
* Push and move to the next story

---

## Inner Loop (While Coding)

* Use **small steps**:
  * extend one workflow, model, or behavior at a time
  * keep changes reviewable and revertible
* Prefer **TDD (red/green/refactor)**:
  1. Write a failing test that defines the desired behavior.
  2. Implement the minimum code to make the test pass.
  3. Refactor while keeping tests green.
  4. In the red phase, scaffold target symbols (empty bodies) to avoid "not found" errors.

Typical commands:

```bash
# Run a specific test file
deno task test:file src/domain/workflows/create_item_test.ts

# Run all tests matching a pattern
deno task test:file tests/e2e/scenarios/*sync*test.ts

# Run full test suite
deno task test
```

To try the CLI manually while developing:

```bash
# Execute CLI commands
deno task exec --help
deno task exec sync init git@github.com:user/repo.git
```

---

## Before Pushing / Opening a PR

* `deno task test` must pass (includes unit + E2E tests).
* `deno lint` and `deno fmt` must pass with no warnings.
* No `TODO`-style shortcuts without context comments.
* No debug prints left behind (`console.log`, etc.).
* Record story logs as Markdown under `docs/stories/` (timestamped filenames in UTC), summarizing:
  * what was attempted and why
  * what was completed (and acceptance checks/verification)
  * any follow-ups or open risks
