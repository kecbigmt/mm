# Repository Guidelines

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

## Coding Style & Naming Conventions

Follow Deno formatting via `deno fmt` (2-space indent, 100 column width) and lint with `deno lint`.
Keep modules small, prefer named exports, and organise imports `@std` → external → relative. Use
branded types and smart constructors (`parseX`) to “parse, don’t validate”. Models should be
immutable; expose methods on frozen records (`Object.freeze`). Name files in `kebab_case.ts`, with
tests mirroring the implementation name plus `_test`.

- **Deno standards first** - Follow Deno conventions for naming, imports, and structure
- **No comments unless explicitly requested** - Keep code self-documenting
- **Latest jsr:@std packages** - Use official Deno standard library packages
- **Test files alongside implementation** - Use `_test.ts` suffix following Deno conventions
- **Pure functions** - Prefer immutable data and pure functions in functional core
- **Type safety** - Leverage TypeScript's type system to prevent invalid states
- **Minimal dependencies** - Only add dependencies that provide significant value
- **Unix philosophy** - Do one thing well, compose with other tools

**This project has not yet been rolled out**, so there is no need to leave legacy code behind for backward compatibility or plan for a gradual migration.

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

## Commit & Pull Request Guidelines

Adopt Conventional Commits (`feat: add node relocation workflow`). Keep each commit small, with
passing tests. Pull requests should summarize domain impact, list affected modules, and include
verification steps (`deno task test`). When UI or CLI output changes, attach `--print` samples or
before/after snippets. Link design context from `docs/steering/design.md` or relevant steering notes
to help reviewers trace intent.

## Domain Design Notes

Respect the domain patterns from the prototype: prefer `Result` over exceptions, model illegal
states out of existence, and propagate context-rich validation issues via `createValidationError`.
When introducing new value objects, back them with branded primitives and exhaustive parsing; demo
usage in tests and CLI workflows before wiring infrastructure.
