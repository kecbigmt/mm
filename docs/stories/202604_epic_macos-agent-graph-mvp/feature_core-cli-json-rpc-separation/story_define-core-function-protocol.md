---
status: draft
depends:
  - story_define-portable-core-and-host-boundary
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Core Function Protocol

**Role**: This story defines the typed request/response boundary between app hosts and the portable
domain core. For feature scope, see
`docs/stories/202604_epic_macos-agent-graph-mvp/feature_core-cli-json-rpc-separation/README.md`.

## Story Log

### Goal

Define the core-function protocol that app hosts can use to invoke portable domain logic either
directly in-process or through a serialized transport.

### Why

Once portable logic is narrowed to the domain/core layer, app hosts still need a stable way to ask
the core for parsing, planning, and decision-making behavior. That contract should exist before any
JSON-RPC method surface is finalized, otherwise transport details will leak into the core design.

### User Story

**As an app-host developer, I want a typed core-function protocol, so that my host can call shared
domain logic consistently whether it runs in-process or across a local transport boundary.**

### Acceptance Criteria

- [ ] **Given** the portable core boundary, **When** this story defines "core function",
      **Then** it uses explicit criteria:
      no IO,
      no repository dependency,
      no ambient time/environment access,
      and operation only on explicit inputs
- [ ] **Given** representative portable core behaviors, **When** this story is completed, **Then**
      the docs define typed request/response shapes for at least parsing and one mutation-planning
      function
- [ ] **Given** app hosts may use direct calls or JSON-RPC, **When** the protocol is described,
      **Then** it avoids transport-only concerns such as request IDs, streaming envelopes, or CLI
      formatting
- [ ] **Given** current use cases mix pure and effectful work, **When** example functions are
      listed, **Then** they focus on domain-level outputs such as parsed expressions, validated move
      plans, or snooze decisions rather than repository writes
- [ ] **Given** time-sensitive domain behavior exists, **When** example functions are documented,
      **Then** they receive time as explicit input rather than reading it implicitly

### Out Of Scope

- implementing protocol handlers
- defining the full JSON-RPC envelope
- moving all existing use-case logic into domain
