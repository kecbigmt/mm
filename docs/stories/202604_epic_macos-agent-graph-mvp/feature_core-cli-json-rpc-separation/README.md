---
status: planning
depends: []
---

# Core / CLI / JSON-RPC Separation

**Role**: This document defines the feature-level scope for separating reusable core logic from CLI
presentation and exposing the same capabilities through a structured local API. For epic context,
see `docs/stories/202604_epic_macos-agent-graph-mvp/README.md`.

## Goal

Create a reusable core that can be consumed by both the existing CLI and a future SwiftUI macOS app
through JSON-RPC, without copying workflows or binding domain logic to CLI-only parsing and output.

## In Scope

- define a UI-agnostic core/application boundary
- move reusable use cases out of `presentation/cli`
- remove domain/application dependencies on CLI parsing modules
- introduce a structured local API surface for macOS integration
- keep CLI as a thin presentation adapter over shared core use cases
- define DTOs and error mapping suitable for JSON-RPC responses
- preserve compatibility with the existing GitHub sync and multi-client file workflow

## Out of Scope

- implementing the full macOS UI
- designing all agent features in detail
- transport hardening for remote access
- replacing the CLI with JSON-RPC
- backward-compatibility layers beyond what current development needs

## Design Targets

1. **One core, multiple adapters** CLI and JSON-RPC should call the same use cases.

2. **Structured inputs and outputs** Core entry points should accept typed data, not CLI-shaped
   strings as the only interface.

3. **Presentation-free domain** Domain and application code must not import `presentation/cli`.

4. **Clear composition root** Runtime wiring for repositories and services should move out of
   CLI-only dependency loading.

5. **Sync compatibility is mandatory** Core and presentation separation must not break the existing
   GitHub-based multi-client workflow.

## Expected Deliverables

- `application` or equivalent core-facing module structure
- shared runtime/composition entry point
- thin CLI adapter updates for migrated flows
- JSON-RPC presentation skeleton and initial method set
- migration plan for remaining commands still coupled to CLI behavior
- explicit notes on preserving sync-related behaviors during the split

## Candidate First Use Cases

- open workspace
- list items
- get item
- create item
- edit item
- move item

## Open Questions

- whether JSON-RPC should run as a long-lived sidecar or on-demand local process
- how progress, warnings, and preview/apply flows should be represented in structured responses
- which commands must migrate first to unblock the SwiftUI shell
