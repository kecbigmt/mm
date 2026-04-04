---
status: draft
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Move Path And Range Parsing Out Of CLI

**Role**: This story defines the parser extraction needed to keep domain and application code free
of `presentation/cli` imports.

## Story Log

### Goal

Remove CLI parser dependencies from reusable code paths by relocating path and range parsing to a
shared non-presentation module.

### Why

`list_items.ts` and `move_item.ts` currently import parsing helpers from `presentation/cli`. That
dependency direction blocks reuse from JSON-RPC and future macOS-facing APIs. Parsing rules that
shape reusable execution must live outside the CLI adapter.

### User Story

**As a core maintainer, I want path and range parsing to live outside the CLI layer, so that shared
use cases can be reused without importing `presentation/cli`.**

### Acceptance Criteria

#### 1. Parser Relocation

- [ ] **Given** the current path and range grammar, **When** parsing helpers are relocated, **Then**
      reusable code can import them without depending on `presentation/cli`
- [ ] **Given** CLI commands still need the same grammar, **When** they parse expressions, **Then**
      behavior remains unchanged from the user perspective

#### 2. Workflow Decoupling

- [ ] **Given** `list_items.ts` and `move_item.ts`, **When** they are updated, **Then** they no
      longer import parsing helpers from `presentation/cli`
- [ ] **Given** parser errors occur, **When** reusable workflows consume them, **Then** they still
      return typed validation errors suitable for multiple adapters

#### 3. Safety

- [ ] **Given** current parsing tests, **When** the parser is moved, **Then** equivalent coverage
      remains for path and range behavior

### Out Of Scope

- Redesigning the grammar itself
- Migrating all commands to new use-case APIs
- JSON-RPC method design

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Remove backward-compatibility re-export shim (path_parser.ts) and duplicated test file
(path_parser_test.ts): no duplication, loose coupling. Update 7 CLI commands to import parsers
directly from domain/primitives/path_expression_parser.ts.
**Design:** CLI commands now depend on domain primitives directly, eliminating the unnecessary
indirection layer. Tests live only in domain where the implementation lives.
**Quality:** Tests passing (703), Linting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Parser Relocation): PASS - `parsePathExpression` and `parseRangeExpression` live in `src/domain/primitives/path_expression_parser.ts`; importable without any `presentation/cli` dependency
- Criterion 2 (Workflow Decoupling): PASS - `src/domain/workflows/list_items.ts` and `src/domain/workflows/move_item.ts` contain zero imports from `presentation/cli` (confirmed by grep); typed validation errors returned on parse failure
- Criterion 3 (Safety): PASS - test coverage for path and range parsing lives alongside the implementation in `src/domain/primitives/`; all 703 tests pass

**Tests:** All passing (703)
**Quality:** Linting clean, no debug output, no bare TODOs
**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- deciding whether parsing belongs in domain primitives or application helpers
- avoiding accidental semantic changes while moving the module
