# Source Layout Policy

**Role**: This document defines source-code placement rules inside `src/` for shared core,
application use cases, domain helpers, and presentation adapters. For repository-wide conventions,
see root `AGENTS.md`.

## Boundary Rule

Use `src/application/use_cases/` as the public entry layer for shared client operations.

- Put use-case orchestration that coordinates repositories, ID generation, ranking, parsing of
  typed request fields, and persistence in `application/use_cases`
- Keep `src/presentation/` thin: CLI and JSON-RPC adapt input/output, invoke application use cases,
  and own UI-specific side effects
- Do not let adapters import `src/domain/workflows`

## Domain Rule

Keep `src/domain/` focused on domain-specific logic.

- `primitives/`: branded values, parsing, validation, small conversions
- `models/`: immutable entities/value-rich records
- `services/`: small domain helpers and business rules that do not define an adapter-facing use case
- Avoid coarse orchestration modules in `domain` that mainly coordinate repositories and persistence

## Workflow Migration Rule

When a flow has an `application/use_cases/*` entry point, do not keep an equivalent coarse-grained
implementation module under `src/domain/workflows/` or `src/domain/services/`.

- Either move the orchestration into the application use case
- Or split remaining domain-specific pieces into smaller helpers under `domain`

## Testing Rule

- Test application orchestration in `src/application/use_cases/*_test.ts`
- Test domain helpers alongside their implementation in `src/domain/**/_test.ts`
- Do not keep tests under removed workflow paths after the orchestration has moved up
