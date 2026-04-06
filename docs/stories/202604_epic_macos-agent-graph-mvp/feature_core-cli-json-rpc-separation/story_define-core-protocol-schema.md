---
status: draft
depends:
  - story_define-portable-core-and-host-boundary
  - story_define-core-function-protocol
  - story_define-json-rpc-envelope
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define Core Protocol Schema

**Role**: This story defines the serializable schema for the portable core-function protocol and
its JSON-RPC binding rules. For feature scope, see
`docs/stories/202604_epic_macos-agent-graph-mvp/feature_core-cli-json-rpc-separation/README.md`.

## Story Log

### Goal

Define the request, response, and error schema for portable core functions in a transport-neutral
form, then define how those schemas map onto JSON-RPC when a transport boundary is needed.

### Why

The current feature direction now treats domain/core logic as the portable shared layer and app
use-case orchestration as host-specific. That makes the next design step a schema problem rather
than a shared-use-case problem: app hosts need a stable, serializable contract for calling portable
core functions, and macOS may need to carry that contract across JSON-RPC.

Defining the schema now keeps the architecture flexible:

- direct in-process calls can use the same typed shapes
- JSON-RPC can serialize those shapes without redefining them
- a future multi-language implementation can reuse the same protocol concepts even if the encoding
  changes later

### User Story

**As a platform and integration developer, I want a defined core protocol schema, so that hosts can
call portable core functions consistently and JSON-RPC can expose them without becoming the source
of truth for the core contract.**

### Acceptance Criteria

#### 1. Transport-Neutral Schema Exists

- [ ] **Given** the portable core exposes typed functions, **When** this story is completed, **Then**
      the docs define serializable request and response schema shapes that are independent of
      JSON-RPC envelope details
- [ ] **Given** the schema is transport-neutral, **When** it is reviewed, **Then** it avoids
      request IDs, JSON-RPC envelope fields, and CLI-specific formatting concerns

#### 2. Representative Core Functions Are Covered

- [ ] **Given** the current portable-core direction, **When** example schemas are chosen, **Then**
      they cover at least:
      one parsing function,
      one mutation-planning function,
      and one validation or decision function
- [ ] **Given** those examples are documented, **When** they are reviewed, **Then** they use domain
      snapshots and typed DTOs rather than repository handles or filesystem paths as implicit host
      state
- [ ] **Given** repository access is host-specific, **When** request/response schemas are defined,
      **Then** the schema uses repository-free DTOs and explicit value objects only

#### 3. Error Schema Is Serializable

- [ ] **Given** portable core functions may reject invalid input or impossible domain transitions,
      **When** the schema is defined, **Then** there is a serializable error shape suitable for both
      in-process use and JSON-RPC transport
- [ ] **Given** host-specific failures such as repository or git errors remain outside the portable
      core, **When** the error schema is documented, **Then** it distinguishes core-domain errors
      from host/runtime errors

#### 4. JSON-RPC Binding Rules Are Explicit

- [ ] **Given** macOS may call the core or host through JSON-RPC, **When** this story is completed,
      **Then** the docs define how transport-neutral function schemas map onto JSON-RPC method
      names, `params`, `result`, and error payloads
- [ ] **Given** JSON-RPC lives at the host boundary, **When** binding rules are written, **Then**
      the docs explicitly distinguish binding selected core functions from binding host use cases
- [ ] **Given** JSON-RPC is not the source of truth, **When** binding rules are written, **Then**
      they reference the core protocol schema rather than redefining per-method payloads from
      scratch

#### 5. Encoding Choice Is Deferred Intentionally

- [ ] **Given** protobuf or another IDL may become attractive later, **When** this story is
      completed, **Then** the docs explicitly record that the immediate step is schema-first using
      portable request/response definitions, not a premature switch of implementation language or
      transport encoding

### Out Of Scope

- choosing protobuf, gRPC, or another long-term IDL now
- rewriting the core in Go or another language
- implementing JSON-RPC handlers
- extracting all current domain logic in this story

### Expected Output

This story should leave behind:

- a canonical set of transport-neutral request/response/error schema examples
- method naming and payload binding rules for JSON-RPC
- explicit guidance that schema stability comes before transport or language migration
