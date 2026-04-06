# ADR: Multi-Host Core Boundary

**Role**: This document defines the architectural decision for separating the portable domain core
from host-specific application orchestration for `feature_core-cli-json-rpc-separation`. For the
domain model, see `docs/steering/design.md`.

## Status

Accepted

## Context

mm now exposes most adapter-facing behavior through `src/application/use_cases`, but those modules
still contain substantial orchestration tied to the current Deno runtime:

- environment-based workspace discovery in `src/application/runtime.ts`
- filesystem-backed repositories and direct path inspection
- git execution through the current version-control infrastructure
- process/session identity via `Deno.uid()` and `Deno.ppid`
- local cache and index maintenance around sync flows

That shape works for the CLI and a local macOS adapter, but it is not the right definition of the
portable core for future iOS and Android hosts. Different app runtimes are expected to expose
different product surfaces, so forcing them to share the same use-case orchestration would couple
the core to one host's runtime assumptions.

## Decision

mm adopts **portable domain core plus host-specific use cases** as the architectural baseline.

This means:

- portable logic lives in domain models, parsing, validation, and pure decision functions
- application/use-case orchestration belongs to the host runtime that owns repositories, git,
  workspace access, scheduling, and persistence
- CLI, Deno JSON-RPC, macOS, iOS, and Android may each define different use cases over the same
  core rules
- JSON-RPC is an optional transport for core or host functions, not the definition of the core API

mm does **not** assume that every host can run a long-lived local sidecar process. That remains an
optional macOS implementation choice, not a global architecture requirement.

## Capability Boundary

The following concerns are host-dependent and must stay behind capability interfaces or host
composition boundaries:

1. Workspace access
   Resolving the active workspace, restoring previously granted roots, and revalidating access to a
   user-selected workspace.

2. Filesystem operations
   Reading, writing, listing, deleting, moving, and watching workspace files and directories.

3. Version control
   Pull, push, clone, branch discovery, commit preparation, and repository-state inspection.

4. Session and execution context
   Session identity, process identity, interactive execution lifecycle, and cancellation.

5. Background work
   Scheduling or observing sync, index rebuild, and other deferred jobs.

6. Local cache and index maintenance
   Completion cache updates, index rebuild triggers, temporary directory cleanup, and sync-state
   persistence.

## Portable Core Boundary

The following should remain portable and transport-independent:

- domain models and invariants
- parsing and normalization helpers that are not presentation-specific
- pure decision logic such as move planning, snooze decisions, and validation rules
- typed request/response shapes for core functions
- error types that describe business failures without transport formatting

## Consequences

Positive:

- CLI, macOS, and future mobile apps can share business rules without sharing one runtime's use
  cases
- hosts can choose direct calls or local transport without redefining the portable core
- JSON-RPC can be added incrementally without forcing the architecture around a desktop-only process
  model

Constraints:

- `src/application/runtime.ts` should be treated as the current Deno host/runtime composition layer
- many existing `application/use_cases` modules are host orchestration, not portable core
- sync and workspace bootstrap flows remain effectful and must not be treated as pure core logic
- infrastructure-specific steps such as index rebuilds, temp cleanup, and sync-state resets stay in
  host or adapter layers unless promoted into explicit host capabilities

## Implementation Guidance

Near-term follow-up design and implementation should proceed in this order:

1. define the portable-core versus Deno-host boundary explicitly in feature docs
2. define the typed core-function protocol independent of transport
3. map selected core or host functions onto JSON-RPC only where transport adds value

## Non-Goals

This decision does not:

- choose a specific mobile git library
- require a macOS XPC host
- require every app to share the same use cases
- require an in-process mobile implementation for every feature
- redesign existing CLI UX
