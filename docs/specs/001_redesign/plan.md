# Implementation Plan — Item/Section Redesign

## Current State Snapshot

- The domain item model still stores a `ContainerPath` string for placement
  (`src/domain/models/item.ts:59`) and delegates ordering to legacy container edges, so there is no
  notion of parent Item + Section pairing yet.
- Container infrastructure is calendar-oriented (`src/domain/models/container.ts:214-244`) and the
  filesystem adapters persist `nodes/<year>/<month>/<day>/<id>` plus container edge directories
  (`src/infrastructure/fileSystem/item_repository.ts:41-55`,
  `src/infrastructure/fileSystem/container_repository.ts:19-28`), which diverges from the redesign
  layout under `items/` with per-section edge folders.
- Identifier resolution still depends on 7-character short IDs
  (`src/domain/services/item_resolution_service.ts:35-71`) and the repository exposes
  `findByShortId` (`src/domain/repositories/item_repository.ts:11-18`), conflicting with the
  redesign’s “UUID v7 only” rule.
- Alias and context primitives enforce lowercase ASCII slugs
  (`src/domain/primitives/alias_slug.ts:28-84`, `src/domain/primitives/tag_slug.ts:21-61`) and
  repositories persist files named by the raw slug
  (`src/infrastructure/fileSystem/alias_repository.ts:18-70`), whereas the redesign requires Unicode
  input, canonical keys, and hashed filenames.
- CLI flows (e.g. note creation) still assume day containers and short IDs
  (`src/presentation/cli/commands/note.ts:67-93`), with no support for Sections, ranges, or logical
  CWD semantics.

## Guiding Constraints

- Break compatibility where it simplifies the redesign; we are still pre-release and can prefer a
  single cut-over to the new structure.
- Surface canonicalization and hashing through shared utilities so both aliases and tags reuse the
  same implementation.
- Keep repositories transactional: continue using `Result` error handling and temp-file writes
  consistent with current infrastructure.
- Document the new expectations clearly so workspaces can be recreated or migrated manually after
  the cut-over.

## Phase Breakdown

### Phase 1 — Canonical primitives & utilities

- Introduce a `CanonicalKey` helper (NFKC → casefold) and define a `HashingService` interface in
  `src/domain/services`; provide SHA-256 infrastructure implementations that the domain can depend
  on abstractly. Add focused tests covering mixed-script aliases.
- Replace `AliasSlug`/`ContextTag` string primitives with value objects that retain
  `{ raw, canonicalKey }`, enforcing redesigned validation rules.
- Add Section-related primitives (`section_path.ts`, `section_segment.ts`) capturing numeric/date
  segments and validation errors without touching existing models yet.
- Update alias/context model tests and repositories to exercise the new canonicalisation API while
  preserving current behaviour behind feature flags or adapters.

### Phase 2 — Placement-first domain model

- Remove `ContainerPath` from active domain usage; make `Placement` the sole source of logical
  location data for items and edges.
- Introduce an explicit section tree in the domain (section nodes containing either child sections or
  item edges) so placement context is derived from structure, not serialized onto each edge.
- Delete the legacy container models, repositories, and conversion helpers; update tests to assert on
  the new placement-centric shape only.
- Add comprehensive unit tests covering placement immutability, section nesting, and LexoRank
  transitions within sections.

### Phase 3 — Filesystem adapters & storage layout

- Replace the `nodes/` storage with the redesign’s `items/YYYY/MM/DD/<item-id>/` tree and store
  edges in per-section folders that mirror the in-memory section structure.
- Drop short-ID index files; persist hashed canonical alias/tag entries under
  `.index/aliases/<hh>/<hash>.alias.json` and `tags/<hash>.tag.json`. Item `meta.json` continues to
  keep only the raw alias while indexes handle canonical metadata.
- Update workspace bootstrap (`src/infrastructure/fileSystem/workspace_repository.ts`) to create the
  new scaffold (`items/`, `.index/aliases/`, `tags/`).
- Rewrite the filesystem repositories to read/write the placement tree atomically and update all
  integration tests accordingly.

### Phase 4 — Locator parsing & resolution services

- Implement a dedicated locator parser that resolves IDs → alias → dates/sections according to the
  redesign precedence, with range validation.
- Replace `ItemResolutionService.resolveItemId` usage with a new `LocatorResolutionService` that
  understands UUID v7, aliases, and date sugar; remove short-ID branches from repositories.
- Add pure parsing tests (covering relative weekdays, periods, and numeric section ranges) plus
  integration tests resolving actual items from the filesystem adapter.

### Phase 5 — Workflows & CLI experience

- Update creation/move/list workflows to operate on `Placement`, supporting explicit section targets
  (`head:`, `tail:`, `after:`/`before:`) and ensuring LexoRank usage remains encapsulated.
- Expand CLI commands: add `mm cd`, `mm ls`, `mm where`, `mm mv` per the redesign, and adapt
  existing commands (`note`, `close`, `reopen`) to reference the new locator syntax.
- Provide fixtures and snapshot tests demonstrating logical navigation, including parent-anchored
  ranges and relative tokens.

### Phase 6 — Migration & doctor tooling

- (Deferred) Skip automated migration logic for now; development workspaces can be recreated once
  the redesign ships.
- Extend `mm doctor` to validate edge consistency, detect duplicated canonical keys, and offer
  `--reindex` for LexoRank compaction under the new hierarchy.
- Document future migration expectations in `docs/specs/001_redesign/` and update user-facing README
  snippets to reference locators instead of container paths.

## Testing & Tooling Strategy

- Maintain parity with existing unit suites while adding coverage for canonicalisation, placement
  invariants, and locator parsing. Ensure `deno task test` exercises the new behaviour end-to-end.
- Add integration tests that create items via CLI workflows and confirm on-disk layout, using
  temporary workspace directories in `item_repository_test.ts`.
- Leverage property-based tests where feasible (e.g. for LexoRank spacing, alias canonical
  collisions) to guard against regression during refactors.

## Open Questions

- Section-range validation remains an open design decision (likely in primitives unless dependencies
  force a service-level implementation).
