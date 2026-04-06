---
status: completed
depends: []
syncs:
  - feature_core-cli-json-rpc-separation/README.md
---

# Define JSON-RPC Envelope

**Role**: This story defines the transport-neutral JSON-RPC message contract that a future local
adapter may use to expose selected core or host functions to the macOS client.

## Story Log

### Goal

Define the JSON-RPC request, response, and error envelope for local core or host access.

### Why

The SwiftUI app may consume selected core or host functions through a structured local API.
Defining the envelope early allows response and error shapes to fit a future JSON-RPC adapter
without forcing transport details into the domain layer.

### User Story

**As a macOS integration developer, I want a defined JSON-RPC envelope for local core or host
calls, so that I can build the SwiftUI-side client against a stable structured contract.**

### Acceptance Criteria

#### 1. Message Shape

- [ ] **Given** a future local JSON-RPC adapter, **When** it exposes core or host methods, **Then** request,
      success response, and error response envelopes are defined consistently
- [ ] **Given** adapters need correlation, **When** messages are exchanged, **Then** the envelope
      defines how request IDs are represented

#### 2. Error Mapping

- [ ] **Given** validation and repository failures from exposed functions, **When** they are exposed
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
- JSON-RPC notifications (requests without id) — add when a concrete use case requires them

---

### Completed Work Summary

### Refactoring
**Status: Complete - Ready for Verify**
**Applied:** Extract isValidationError and isRepositoryError type guards from error_mapper.ts to
their source modules (shared/errors.ts and repository_error.ts): high cohesion, single
responsibility. Guards belong with the discriminants they check.
**Design:** error_mapper.ts now imports reusable guards instead of inlining duck-typing logic.
**Quality:** Tests passing (703), Linting clean
**Next:** Verify

### Verification
**Status: Verified - Ready for Code Review**
**Acceptance:** 2026-04-04
- Criterion 1 (Message Shape): PASS - `src/presentation/jsonrpc/envelope.ts` defines `JsonRpcRequest`, `JsonRpcSuccessResponse<T>`, `JsonRpcErrorResponse`, and `JsonRpcResponse<T>` with consistent `"2.0"` field; `JsonRpcId = string | number` handles request ID correlation
- Criterion 2 (Error Mapping): PASS - `src/presentation/jsonrpc/error_mapper.ts` maps `ValidationError` to `-32001` and `RepositoryError` to `-32002` using `isValidationError`/`isRepositoryError` guards from source modules; no CLI behavior embedded
- Criterion 3 (Boundary Clarity): PASS - envelope and error_mapper live in `presentation/jsonrpc`; domain and application layers have zero imports from this module (confirmed by grep)

**Tests:** All passing (703) - includes `envelope_test.ts` and `error_mapper_test.ts`
**Quality:** Linting clean, no debug output, no bare TODOs
**Next:** Code Review

### Follow-ups / Open Risks

#### Addressed

- none yet

#### Remaining

- deciding whether warnings belong inside result payloads or side-channel notifications
- deciding how progress and preview/apply flows should extend the base envelope later
