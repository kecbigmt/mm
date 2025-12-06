# Repository Guidelines

**Role**: This is the **minimal constitution** for agent behavior—essential project conventions, coding standards, testing practices, and commit guidelines. For detailed workflows, see `docs/steering/development-workflow.md`. For document structure, see `docs/AGENTS.md`.

## Project Overview

mm is a personal knowledgement CLI tool with built-in MCP server.

It has a local-files PKM system unifying GTD / Bullet Journal / Zettelkasten via a single **Node**
model, stored as plain Markdown + JSON, Git-friendly. Items are created under a date container
(Calendar), never moved physically; “moves” are reference (edge) relocations.

## Project Structure & Module Organization

mm is a Deno TypeScript CLI with a functional domain core. Domain logic lives under `src/domain`,
split into `primitives` (branded types such as `item_id.ts`, `container_path.ts`), `models`
(container/item node ADTs), and `workflows` for orchestration. Shared functional helpers (e.g.
`brand.ts`, `result.ts`, validation errors) sit in `src/shared`. Infrastructure adapters and
presentation code live under `src/infrastructure` and `src/presentation` respectively. Documentation
is under `docs/`, with detailed product steerage in `docs/steering/design.md`.

## Build, Test, and Development Commands

- `deno task start` – run the CLI entry point once (`src/main.ts`).
- `deno task dev` – hot-reload the CLI for local iteration.
- `deno task test` – execute all unit and integration tests. Use `deno run` sparingly; prefer the
  tasks so flags match repository defaults.

### Test Execution Strategy

**For efficiency, use targeted tests during development and full test suite for final verification:**

- **During development** (incremental verification):
  - `deno task test:file <path>` – Run specific test files only
  - Example: `deno task test:file src/domain/workflows/create_item_test.ts`
  - Example: `deno task test:file tests/e2e/scenarios/task_creation_test.ts`
  - Use patterns: `deno task test:file tests/e2e/scenarios/*creation_test.ts`

- **Before commits** (full verification):
  - `deno task test` – Complete test suite (runs `test:unit` + `test:e2e`)

## Coding Style & Naming Conventions

Follow Deno formatting via `deno fmt` (2-space indent, 100 column width) and lint with `deno lint`.
Keep modules small, prefer named exports, and organise imports `@std` → external → relative. Use
branded types and smart constructors (`parseX`) to "parse, don't validate". Models should be
immutable; expose methods on frozen records (`Object.freeze`). Name files in `kebab_case.ts`, with
tests mirroring the implementation name plus `_test`.

- **Deno standards first** - Follow Deno conventions for naming, imports, and structure
- **Code comments** - Keep code self-documenting through clear naming and structure. Write comments
  in English to explain **why** (intent, design decisions, constraints) rather than **what**
  (implementation details). Document purpose, rationale, and edge cases; avoid restating obvious
  logic
- **Latest jsr:@std packages** - Use official Deno standard library packages
- **Test files alongside implementation** - Use `_test.ts` suffix following Deno conventions
- **Pure functions** - Prefer immutable data and pure functions in functional core
- **Type safety** - Leverage TypeScript's type system to prevent invalid states
- **Minimal dependencies** - Only add dependencies that provide significant value
- **Unix philosophy** - Do one thing well, compose with other tools

**This project has not yet been rolled out**, so there is no need to leave legacy code behind for
backward compatibility or plan for a gradual migration.

## Design Patterns

- **Domain Modeling Made Functional**: Type-safe domain models with impossible illegal states
- **Railway Oriented Programming**: `Result<T, E>` for composable error handling
- **Functional Core, Imperative Shell**: Pure functions for business logic, side effects isolated
- **Brand Types**: Type-safe value objects using branded primitives
- **Make Illegal States Unrepresentable**: Design domain models so invalid business states cannot be
  constructed or represented in the type system

## Testing Guidelines

Use Deno’s test runner with colocated unit tests. Name suites after the module under test
(`Deno.test("itemId.parse", ...)`). Cover success and failure branches, asserting `Result` variants
instead of throwing. Property-based tests are welcome for domain invariants; keep fixtures
deterministic. For acceptance coverage, add scenario files under `tests/` and reference real
workspace fixtures.

- Tests are placed alongside implementation files using `_test.ts` suffix (Deno standard)
- Property-based testing for domain invariants and functional laws
- Unit tests for all value objects and smart constructors
- Integration tests for workflows and business logic
- All tests must pass before commits: `deno task test`
- Favor TDD (red/green/refactor). In the red phase, scaffold the target symbols (empty bodies) so errors reflect behavior, not missing references (i.e., avoid “function not found” reds).

## Specs & Plans (design.md / plan.md)

- Keep design docs English-only; communication may be in other languages, but specs stay in English.
- Make limits and policies explicit (caps, warnings, error vs warn paths).
- Partition responsibilities clearly: domain returns flat data; presentation handles partitioning/formatting.
- Plans should be LLM-friendly: small, serializable tasks, note parallelizable parts; prefer pure functions and DTOs for testability.
- Include warning examples and DoD; prefer fixed constants over env-config unless required.
- Design docs should include: scope/in-scope vs out-of-scope, inputs/outputs and concrete examples, acceptance criteria, high-level e2e scenarios, file/dir layout decisions, and key interfaces/types (method signatures) for new pieces. Include sample warnings/errors when relevant.

## Development Workflow

Follow the workflow defined in `docs/steering/development-workflow.md`.

## Commit & Pull Request Guidelines

**Before every commit**:
- Run `deno lint` and `deno fmt` to ensure code quality and consistency
- Run `deno task check-docs` to verify documentation length limits (if AGENTS.md, CLAUDE.md, GEMINI.md, or docs/steering/*.md changed)
  - Requires [uv](https://docs.astral.sh/uv/): `curl -LsSf https://astral.sh/uv/install.sh | sh`

All checks must pass before being committed.

Adopt Conventional Commits (`feat: add node relocation workflow`). Keep each commit small, with
passing tests. Pull requests should summarize domain impact, list affected modules, and include
verification steps (`deno task test`). When UI or CLI output changes, attach `--print` samples or
before/after snippets. Link design context from `docs/steering/design.md` or relevant steering notes
to help reviewers trace intent.

### Commit Message Structure

Write commit messages that convey **intent and purpose**, not implementation details (which are
visible in the diff).

- **Title (line 1)**: Express what changed and **why it matters** in this commit. Use imperative
  mood, be concise.
- **Body (line 3+)**: Explain **why this change is necessary** in the broader context. What goal
  does this commit (along with related commits) aim to achieve? Add background only if it helps
  understanding.

Keep messages concise—avoid redundancy with what the code already shows. Avoid symbolic references
(e.g., "Workstream A", "Phase 2") that require reading other documents to understand. Avoid messages
that merely restate code changes (e.g., "add field", "update logic", "refactor code").

Example:
```
feat(domain): define SectionQueryService interface

Enable the CLI to show section stubs without loading item bodies.
This allows nested section summaries to be rendered efficiently
and decouples section queries from storage implementation.
```

## Domain Design Notes

Respect the domain patterns from the prototype: prefer `Result` over exceptions, model illegal
states out of existence, and propagate context-rich validation issues via `createValidationError`.
When introducing new value objects, back them with branded primitives and exhaustive parsing; demo
usage in tests and CLI workflows before wiring infrastructure.

## Documentation Guidelines

**Single Source of Truth**: Each piece of information must exist in exactly one place. Duplication leads to inconsistency.

**Strict No-Duplication Policy**: The following files must NEVER contain duplicate information:
* All `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` files (project root, subdirectories)
* `docs/steering/*.md`

Cross-reference instead of duplicating. Use clear references like "See `docs/AGENTS.md` for file structure."

**Length Limits**:
* Tokens (primary constraint):
  * Target: ≤1000 tokens per file
  * Maximum: ≤2500 tokens per file (CI fails)
* Lines (secondary guideline):
  * Target: ≤100 lines per file
  * 250+ lines triggers warning

Token count is the primary constraint. If a document exceeds 2500 tokens, it must be split into multiple focused documents.

**Role Declaration**: Every document must declare its specific role at the top to prevent overlap:
```markdown
**Role**: This document defines [specific responsibility]. For [other concern], see [reference].
```

**Enforcement**: CI checks document length on every commit. Pull requests violating these limits will fail.
