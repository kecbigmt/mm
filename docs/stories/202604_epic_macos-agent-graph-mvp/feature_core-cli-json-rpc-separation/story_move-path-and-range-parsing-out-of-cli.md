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

Not yet started.

### Acceptance Checks

**Status: Pending Product Owner Review**

Developer verification completed:

- not yet started

**Awaiting product owner acceptance testing before marking this user story as complete.**

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- deciding whether parsing belongs in domain primitives or application helpers
- avoiding accidental semantic changes while moving the module
