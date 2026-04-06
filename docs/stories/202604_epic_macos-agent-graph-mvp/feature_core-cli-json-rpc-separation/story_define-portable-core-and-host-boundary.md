---
status: draft
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Portable Core And Host Boundary

**Role**: This story defines the corrected host/core split for keeping mm portable across CLI,
macOS, and future mobile apps. For feature scope, see
`docs/stories/202604_epic_macos-agent-graph-mvp/feature_core-cli-json-rpc-separation/README.md`.

## Story Log

### Goal

Define the portable core as domain-level logic and define application/use-case orchestration as
host-specific, so future app runtimes can choose their own use cases while sharing the same core
rules and typed protocol.

### Why

The earlier separation line treated `application/use_cases` as the shared adapter boundary for CLI
and future JSON-RPC clients. That was useful for retiring CLI imports of `domain/workflows`, but it
is no longer the right long-term target for multi-host support.

The current use cases still contain substantial orchestration tied to repositories, filesystem
access, git operations, workspace resolution, and runtime-specific cleanup. That makes them closer
to a Deno application host than to a portable core.

If macOS, iOS, and Android are expected to expose different product surfaces, it is more natural
for each app runtime to own its own use cases while sharing:

- domain models and pure domain logic
- parsing and planning helpers that are transport-independent
- typed request/response contracts for core functions

### User Story

**As a platform architect, I want mm to treat domain logic as the portable core and app/use-case
orchestration as host-specific, so each app can define only the use cases it needs without forking
the underlying business rules.**

### Acceptance Criteria

#### 1. Portable Core Is Defined Narrowly

- [ ] **Given** the current architecture, **When** this story is completed, **Then** the docs define
      the portable core as domain models, validation, parsing, and pure decision logic rather than
      all of `application/use_cases`
- [ ] **Given** future app runtimes, **When** the boundary is described, **Then** it is explicit
      that app-specific use cases may differ between CLI, macOS, iOS, and Android

#### 2. Host-Specific Orchestration Is Named Explicitly

- [ ] **Given** the current Deno codebase, **When** the host layer is described, **Then** it
      includes application orchestration that depends on repositories, git, workspace access,
      background work, cache/index maintenance, or runtime-specific cleanup
- [ ] **Given** `src/application/runtime.ts` and the current migrated use cases, **When** they are
      classified, **Then** the docs treat them as the current Deno host implementation rather than
      the portable core itself

#### 3. Core Protocol Boundary Is Clear

- [ ] **Given** app hosts may call the portable core in-process or through a transport, **When**
      this story is completed, **Then** the docs define a typed core-function boundary that can be
      represented either as direct function calls or as JSON-RPC methods
- [ ] **Given** JSON-RPC remains useful for macOS integration, **When** the boundary is documented,
      **Then** JSON-RPC is positioned as one serialization/transport for core or host functions, not
      as the architectural definition of the core

#### 4. Follow-Up Stories Are Reframed

- [ ] **Given** the corrected boundary, **When** follow-up work is listed, **Then** it prioritizes:
      portable-domain extraction from current use cases,
      typed core function protocol definition,
      and JSON-RPC mapping of that protocol where needed
- [ ] **Given** earlier docs assumed shared use cases across adapters, **When** this story is
      completed, **Then** the feature docs no longer require "CLI and JSON-RPC should call the same
      use cases" as a design target

### Out Of Scope

- implementing iOS or Android apps
- rewriting existing use cases in this story
- defining the full macOS transport/runtime process model
- choosing whether every app will embed TypeScript directly

### Investigation Notes

- `src/application/use_cases/sync_pull.ts`, `sync_push.ts`, `sync_init.ts`, and
  `init_remote_workspace.ts` remain strongly tied to host-side effects such as repository access,
  git execution, cleanup, and config persistence
- `src/application/runtime.ts` still owns Deno-specific environment, filesystem, process, and
  repository composition concerns
- the current migrated use cases were still valuable because they removed CLI presentation coupling,
  even if they are not the final portable-core layer

### Expected Output

This story should leave behind docs that clearly separate:

- portable domain/core logic
- host-specific use-case orchestration
- transport adapters such as JSON-RPC

It should also establish the next story sequence for extracting pure logic and defining a typed core
function protocol.
