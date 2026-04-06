---
status: planning
depends: []
---

# Core / CLI / JSON-RPC Separation

**Role**: This document defines the feature-level scope for separating reusable core logic from CLI
presentation and exposing the same capabilities through a structured local API. For epic context,
see `docs/stories/202604_epic_macos-agent-graph-mvp/README.md`.

## Goal

Define a portable domain core and host-specific application/runtime layers so CLI, macOS, and
future mobile apps can share business rules without being forced to share the same use-case
orchestration or transport.

## In Scope

- define a portable domain/core boundary
- define host-specific application/runtime boundaries
- move reusable use cases out of `presentation/cli`
- remove domain/application dependencies on CLI parsing modules
- introduce a structured local API surface for macOS integration where useful
- keep CLI as a thin presentation adapter over Deno-host use cases
- define typed core-function contracts and transport mappings where needed
- preserve compatibility with the existing GitHub sync and multi-client file workflow

## Out of Scope

- implementing the full macOS UI
- designing all agent features in detail
- transport hardening for remote access
- replacing the CLI with JSON-RPC
- backward-compatibility layers beyond what current development needs

## Design Targets

1. **One portable core, multiple hosts** shared business rules live in domain/core; each app may
   own its own use cases.

2. **Typed core protocol** portable core functions should use typed request/response contracts that
   can be called directly or serialized.

3. **Presentation-free domain** Domain/core code must not import `presentation/cli`.

4. **Host-owned orchestration** repository, git, workspace-access, and background-work sequencing
   belongs to app/runtime hosts, not to the portable core.

5. **JSON-RPC is optional transport** JSON-RPC may expose core or host functions, but it does not
   define the core boundary.

6. **Sync compatibility is mandatory** boundary changes must not break the existing GitHub-based
   multi-client workflow.

## Expected Deliverables

- clarified portable-core versus host-runtime module boundaries
- current Deno host/runtime composition entry point
- thin CLI adapter updates for migrated flows
- core protocol schema for transport-neutral request/response/error shapes
- JSON-RPC presentation skeleton and protocol mapping guidance
- extraction plan for moving pure logic from current use cases into domain/core
- explicit notes on preserving sync-related host behaviors during the split

## Candidate First Core Functions

- parse path and range expressions
- plan move placement from resolved inputs
- compute snooze decisions from item state and requested target
- validate status transitions and removal eligibility

## Open Questions

- which existing use-case logic should be extracted into pure domain/core first
- which core protocol schemas should be defined first to unblock macOS integration
- whether macOS should call the Deno host in-process or across a local transport boundary
- which core functions are worth exposing via JSON-RPC versus keeping host-local
