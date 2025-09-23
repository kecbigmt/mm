# Implementation Plan — Item/Section Redesign

## Current State Snapshot
- The domain item model still stores a `ContainerPath` string for placement (`src/domain/models/item.ts:59`) and delegates ordering to legacy container edges, so there is no notion of parent Item + Section pairing yet.
- Container infrastructure is calendar-oriented (`src/domain/models/container.ts:214-244`) and the filesystem adapters persist `nodes/<year>/<month>/<day>/<id>` plus container edge directories (`src/infrastructure/fileSystem/item_repository.ts:41-55`, `src/infrastructure/fileSystem/container_repository.ts:19-28`), which diverges from the redesign layout under `items/` with per-section edge folders.
- Identifier resolution still depends on 7-character short IDs (`src/domain/services/item_resolution_service.ts:35-71`) and the repository exposes `findByShortId` (`src/domain/repositories/item_repository.ts:11-18`), conflicting with the redesign’s “UUID v7 only” rule.
- Alias and context primitives enforce lowercase ASCII slugs (`src/domain/primitives/alias_slug.ts:28-84`, `src/domain/primitives/context_tag.ts:21-61`) and repositories persist files named by the raw slug (`src/infrastructure/fileSystem/alias_repository.ts:18-70`), whereas the redesign requires Unicode input, canonical keys, and hashed filenames.
- CLI flows (e.g. note creation) still assume day containers and short IDs (`src/presentation/cli/commands/note.ts:67-93`), with no support for Sections, ranges, or logical CWD semantics.

## Guiding Constraints
- Preserve existing tests while introducing the new primitives; migrate callers incrementally to avoid a large bang rewrite.
- Surface canonicalization and hashing through shared utilities so both aliases and tags reuse the same implementation.
- Keep repositories transactional: continue using `Result` error handling and temp-file writes consistent with current infrastructure.
- Plan for a one-time workspace migration that can be run via `mm doctor` once the new layout ships.

## Phase Breakdown

### Phase 1 — Canonical primitives & utilities
- Introduce a `CanonicalKey` helper (NFKC → casefold) and define a `HashingService` interface in `src/domain/services`; provide SHA-256 infrastructure implementations that the domain can depend on abstractly. Add focused tests covering mixed-script aliases.
- Replace `AliasSlug`/`ContextTag` string primitives with value objects that retain `{ raw, canonicalKey }`, enforcing redesigned validation rules.
- Add Section-related primitives (`section_path.ts`, `section_segment.ts`) capturing numeric/date segments and validation errors without touching existing models yet.
- Update alias/context model tests and repositories to exercise the new canonicalisation API while preserving current behaviour behind feature flags or adapters.

### Phase 2 — Placement & node model evolution
- Define a `Placement` type (`parentId`, `section`, `rank`) and update `ItemData` to adopt it, keeping an adapter that can still emit legacy `container` strings until storage moves.
- Redesign `Edge` to distinguish logical placements (parent + section) from container bookkeeping; introduce a `SectionEdge` representation aligned with the redesign’s “one active placement” invariant.
- Provide conversion helpers so workflows like `CreateItemWorkflow` can target the new placement API while continuing to read existing containers during the transition.
- Add comprehensive unit tests for placement immutability and rank transitions.

- Replace the `nodes/` tree with the redesign’s `items/YYYY/MM/DD/<uuid>/` structure, ensuring edges nest under `edges/<section-path>/child.edge.json`.
- Drop short-ID index files and instead persist hashed canonical alias/tag entries under `.index/aliases/<hh>/<hash>.alias.json` and `tags/<hash>.tag.json`. Item `meta.json` should continue to store only the raw alias string.
- Update workspace bootstrap (`src/infrastructure/fileSystem/workspace_repository.ts`) to create the new directory scaffold (`items/`, `.index/aliases/`, `tags/`).
- Rewrite `FileSystemItemRepository` and related tests to read/write placements, alias metadata, and edge directories atomically.

### Phase 4 — Locator parsing & resolution services
- Implement a dedicated locator parser that resolves IDs → alias → dates/sections according to the redesign precedence, with range validation.
- Replace `ItemResolutionService.resolveItemId` usage with a new `LocatorResolutionService` that understands UUID v7, aliases, and date sugar; remove short-ID branches from repositories.
- Add pure parsing tests (covering relative weekdays, periods, and numeric section ranges) plus integration tests resolving actual items from the filesystem adapter.

### Phase 5 — Workflows & CLI experience
- Update creation/move/list workflows to operate on `Placement`, supporting explicit section targets (`head:`, `tail:`, `after:`/`before:`) and ensuring LexoRank usage remains encapsulated.
- Expand CLI commands: add `mm cd`, `mm ls`, `mm where`, `mm mv` per the redesign, and adapt existing commands (`note`, `close`, `reopen`) to reference the new locator syntax.
- Provide fixtures and snapshot tests demonstrating logical navigation, including parent-anchored ranges and relative tokens.

### Phase 6 — Migration & doctor tooling
- (Deferred) Skip automated migration logic for now; development workspaces can be recreated once the redesign ships.
- Extend `mm doctor` to validate edge consistency, detect duplicated canonical keys, and offer `--reindex` for LexoRank compaction under the new hierarchy.
- Document future migration expectations in `docs/specs/001_redesign/` and update user-facing README snippets to reference locators instead of container paths.

## Testing & Tooling Strategy
- Maintain parity with existing unit suites while adding coverage for canonicalisation, placement invariants, and locator parsing. Ensure `deno task test` exercises both legacy compatibility (until migration is complete) and the new behaviour.
- Add integration tests that create items via CLI workflows and confirm on-disk layout, using temporary workspace directories in `item_repository_test.ts`.
- Leverage property-based tests where feasible (e.g. for LexoRank spacing, alias canonical collisions) to guard against regression during refactors.

## Open Questions
- Section-range validation remains an open design decision (likely in primitives unless dependencies force a service-level implementation).
