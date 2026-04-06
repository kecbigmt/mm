# ADR: Multi-Host Core Boundary

**Role**: This document defines the architectural decision for separating transport-independent core
contracts from host-dependent capabilities for `feature_core-cli-json-rpc-separation`. For the
domain model, see `docs/steering/design.md`.

## Status

Accepted

## Context

mm now exposes most adapter-facing behavior through `src/application/use_cases`, but the current
runtime composition still assumes Deno-specific host facilities:

- environment-based workspace discovery in `src/application/runtime.ts`
- filesystem-backed repositories and direct path inspection
- git execution through the current version-control infrastructure
- process/session identity via `Deno.uid()` and `Deno.ppid`
- local cache and index maintenance around sync flows

That shape works for the CLI and a local macOS adapter, but it is not a stable baseline for future
iOS and Android hosts. macOS can support stronger process separation, while mobile platforms push
toward embedded execution with platform-specific storage, access-grant, and background-work models.

## Decision

mm adopts **embedded core plus host capability adapters** as the architectural baseline.

This means:

- transport-independent logic lives in domain and application contracts
- host-dependent side effects are exposed through explicit capability interfaces
- CLI, JSON-RPC, and future platform apps are adapters over the same contracts
- JSON-RPC is an adapter transport, not the definition of the core API

mm does **not** assume that every host can run a long-lived local sidecar process. That remains an
optional macOS implementation choice, not a global architecture requirement.

## Capability Boundary

The following concerns are host-dependent and must stay behind capability interfaces or composition
boundaries:

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

## Core Boundary

The following should remain transport-independent:

- domain models, parsing, and validation
- application use case request/response contracts
- error types that describe business or repository failures without transport formatting
- orchestration that depends only on injected capabilities rather than Deno APIs, shell commands, or
  UI-specific behavior

## Consequences

Positive:

- CLI, macOS, and future mobile clients can share the same use case contracts
- host implementations can vary by platform without redefining the core API
- JSON-RPC can be added incrementally without forcing the architecture around a desktop-only process
  model

Constraints:

- `src/application/runtime.ts` should evolve from a Deno-centric composition helper into one host
  implementation among others
- sync and workspace bootstrap flows remain effectful and must not be treated as pure core logic
- infrastructure-specific steps such as index rebuilds, temp cleanup, and sync-state resets stay in
  host or adapter layers unless promoted into explicit host capabilities

## Implementation Guidance

Near-term follow-up design and implementation should proceed in this order:

1. define the local host/runtime boundary that extracts current Deno-specific composition concerns
2. define the initial JSON-RPC dispatch surface over shared application use cases
3. move remaining Deno-only assumptions behind explicit host capabilities where reuse is required

## Non-Goals

This decision does not:

- choose a specific mobile git library
- require a macOS XPC host
- require an in-process mobile implementation for every feature
- redesign existing CLI UX
