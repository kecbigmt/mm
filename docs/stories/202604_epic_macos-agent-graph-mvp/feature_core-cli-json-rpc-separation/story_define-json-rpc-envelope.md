---
status: draft
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define JSON-RPC Envelope

**Role**: This story defines the transport-neutral JSON-RPC message contract that a future local
adapter will use to expose shared core use cases to the macOS client.

## Story Log

### Goal

Define the JSON-RPC request, response, and error envelope for local core access.

### Why

The SwiftUI app is expected to consume shared use cases through a structured local API. Defining the
envelope early allows core-facing APIs to shape responses and errors in a way that will fit a future
JSON-RPC adapter without forcing transport details into the domain layer.

### User Story

**As a macOS integration developer, I want a defined JSON-RPC envelope for local core calls, so that
I can build the SwiftUI-side client against a stable structured contract.**

### Acceptance Criteria

#### 1. Message Shape

- [ ] **Given** a future local JSON-RPC adapter, **When** it exposes core methods, **Then** request,
      success response, and error response envelopes are defined consistently
- [ ] **Given** adapters need correlation, **When** messages are exchanged, **Then** the envelope
      defines how request IDs are represented

#### 2. Error Mapping

- [ ] **Given** validation and repository failures from shared use cases, **When** they are exposed
      through JSON-RPC, **Then** the envelope defines how typed errors map to RPC errors
- [ ] **Given** adapters need warnings or progress later, **When** the envelope is defined, **Then**
      it leaves room for structured extension without embedding CLI behavior

#### 3. Boundary Clarity

- [ ] **Given** the JSON-RPC envelope is defined, **When** shared core code is implemented, **Then**
      transport concerns remain outside domain logic

### Out Of Scope

- Implementing the JSON-RPC server
- Implementing the SwiftUI client
- Exposing every core method immediately

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

- deciding whether warnings belong inside result payloads or side-channel notifications
- deciding how progress and preview/apply flows should extend the base envelope later
