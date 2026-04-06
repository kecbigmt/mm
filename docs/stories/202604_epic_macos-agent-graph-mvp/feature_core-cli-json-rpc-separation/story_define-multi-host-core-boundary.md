---
status: draft
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Multi-Host Core Boundary

**Role**: This story defines the host/core boundary needed to keep mm reusable across CLI, macOS,
and future mobile hosts. For feature scope, see
`docs/stories/202604_epic_macos-agent-graph-mvp/feature_core-cli-json-rpc-separation/README.md`.

## Story Log

### Goal

Define a transport-independent core boundary and an explicit host capability model so mm can support
CLI, local macOS integration, and future iOS/Android adapters without binding core execution to a
desktop-only sidecar process.

### Why

The current separation work moved adapter-facing workflows into `application/use_cases`, but the
runtime composition still assumes Deno environment access, filesystem-backed repositories, git CLI,
session process identifiers, and direct path resolution in `src/application/runtime.ts`. That is
good enough for CLI reuse, but it is not yet a stable core boundary for multi-host clients.

The design question is no longer "should JSON-RPC exist?" but "which responsibilities belong to the
effectful host regardless of transport?" This matters because macOS can support local process
separation, while iOS and Android push toward embedded execution with platform-specific background
and storage capabilities.

### User Story

**As a platform adapter developer, I want mm to define host-dependent capabilities separately from
transport-independent core contracts, so that CLI, local macOS APIs, and future mobile adapters can
reuse the same application logic without assuming a long-lived local sidecar process.**

### Acceptance Criteria

#### 1. Host/Core Boundary Is Explicit

- [ ] **Given** the current `application` and `presentation/jsonrpc` modules, **When** this story is
      completed, **Then** the feature docs define a stable boundary between:
      transport-independent core contracts,
      host-dependent side-effect capabilities,
      and transport adapters such as CLI or JSON-RPC
- [ ] **Given** future macOS, iOS, and Android adapters, **When** the boundary is described,
      **Then** it does not require a long-lived local sidecar process as the only valid execution
      model

#### 2. Existing Runtime Assumptions Are Classified

- [ ] **Given** `src/application/runtime.ts` and the migrated use cases, **When** the boundary is
      analyzed, **Then** each current dependency or assumption is classified as one of:
      core contract,
      host capability,
      or current Deno-specific composition detail
- [ ] **Given** the current runtime, **When** the classification is written down, **Then** it
      explicitly covers at least:
      environment-based workspace resolution,
      filesystem-backed repositories,
      git/version-control execution,
      session/process identity,
      cache/index maintenance,
      and background sync/bootstrap concerns

#### 3. Capability Taxonomy Is Concrete Enough To Implement

- [ ] **Given** host-dependent behavior is identified, **When** the story defines the host model,
      **Then** it names the capability groups that future implementations must provide
- [ ] **Given** the capability groups are listed, **When** they are reviewed against current code,
      **Then** they are concrete enough to map existing responsibilities such as:
      workspace access and granted-root restoration,
      filesystem operations,
      git operations,
      interactive command execution,
      background sync/index scheduling,
      and platform-specific access restoration

#### 4. JSON-RPC Is Positioned As An Adapter, Not The Core

- [ ] **Given** this feature includes local JSON-RPC support, **When** the design is documented,
      **Then** JSON-RPC is described as one host/transport adapter over shared contracts rather than
      the definition of the core API itself
- [ ] **Given** `src/presentation/jsonrpc` already contains envelope and error mapping modules,
      **When** the next implementation stories are derived, **Then** they can build on the defined
      host/core boundary without reopening the transport-versus-host responsibility split

#### 5. Follow-Up Stories Become Executable

- [ ] **Given** the boundary is defined, **When** the story is completed, **Then** at least the
      next two implementation-oriented stories are clear enough to write without further platform
      research:
      one for local host/runtime composition,
      and one for initial JSON-RPC dispatch over shared use cases
- [ ] **Given** sync and workspace bootstrap remain effectful flows, **When** follow-up stories are
      identified, **Then** they preserve the rule that infrastructure-specific logic stays outside
      pure transport-independent contracts

### Out Of Scope

- implementing a macOS app, iOS app, or Android app
- implementing the JSON-RPC dispatcher or server entrypoint
- rewriting repositories or git integration in this story
- choosing a concrete mobile git library
- redesigning CLI UX

### Investigation Notes

- `src/application/runtime.ts` is currently the main composition root and still owns Deno-specific
  concerns such as env lookup, path normalization, `Deno.stat`, `Deno.uid`, `Deno.ppid`, and
  filesystem-backed repository construction
- `src/application/use_cases/sync_pull.ts`, `sync_push.ts`, `sync_init.ts`, and
  `init_remote_workspace.ts` confirm that sync/bootstrap flows are adapter-facing but still rely on
  host-owned side effects such as git execution, file IO, cleanup, and config persistence
- `src/presentation/cli/commands/sync.ts` confirms some infrastructure-specific logic should remain
  in the adapter or host layer, including index rebuilds, temp directory cleanup, and sync-state
  resets after successful push
- `src/presentation/jsonrpc/error_mapper.ts` already establishes JSON-RPC as a presentation concern,
  which supports treating transport as an adapter over shared contracts

### Expected Output

This story should leave behind a design decision document or completed story notes that define:

- the recommended baseline architecture: embedded core plus host capability adapters
- the capability groups mm needs for multi-host support
- the responsibilities that remain host-side even when use cases are shared
- the follow-up story sequence for local host composition and JSON-RPC dispatch

### Verification

This is a definition story. Verification is complete when the resulting document:

- references current repo modules accurately
- resolves whether JSON-RPC is the core boundary or an adapter
- identifies concrete host capability groups from current responsibilities
- yields implementable follow-up stories without redoing platform research
