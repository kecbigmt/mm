# Tasks — Item/Section Redesign

## Phase 1 — Canonical primitives & utilities
- [ ] Introduce `CanonicalKey` helper (NFKC + casefold) with comprehensive tests
- [ ] Define `HashingService` interface in `src/domain/services` and wire SHA-256 implementation under infrastructure
- [ ] Replace alias/context primitives with `{ raw, canonicalKey }` value objects and update model/tests accordingly
- [ ] Update tag primitives/repositories to use canonical keys with hashed storage paths
- [ ] Implement auto-alias generator (CVCV-base36 fallback) aligned with Appendix C
- [ ] Add Section primitives (`section_path.ts`, `section_segment.ts`) with validation logic

## Phase 2 — Placement & node model evolution
- [ ] Design `Placement` type (`parentId`, `section`, `rank`) and update `ItemData`
- [ ] Extend edge model to represent section placements and add conversion helpers for legacy container paths
- [ ] Update `CreateItemWorkflow` and related tests to consume placement API
- [ ] Persist current placement metadata on item records for reverse lookups (without duplicating rank authority)

## Phase 3 — Filesystem adapters & storage layout
- [ ] Introduce new `items/` directory structure and per-section edge storage
- [ ] Remove short-ID index usage; persist hashed canonical alias/tag entries under `.index` and `tags`
- [ ] Ensure item `meta.json` continues to store only raw alias while adapters read/write canonical metadata via indexes
- [ ] Update workspace bootstrap to create new scaffold and adjust repository tests

## Phase 4 — Locator parsing & resolution services
- [ ] Implement locator parser supporting dates, UUID v7, aliases, and section suffixes
- [ ] Replace `ItemResolutionService` usage with new `LocatorResolutionService`; remove short-ID branches
- [ ] Add parser and resolution tests covering relative tokens and range validation

## Phase 5 — Workflows & CLI experience
- [ ] Update create/move/list workflows to operate on placements and new locator semantics
- [ ] Extend CLI commands (`mm cd`, `mm ls`, `mm where`, `mm mv`, etc.) to use locator parsing and section ranges
- [ ] Manage logical CWD state (`MM_CWD`, ancestor fallback) and expose helper subcommands
- [ ] Add fixtures/snapshot tests demonstrating logical navigation and range handling

## Phase 6 — Migration & doctor tooling
- [ ] Extend `mm doctor` checks for canonical alias collisions, placement consistency, and provide `--reindex` for LexoRank compaction
- [ ] Update documentation to describe new layout, locators, and manual workspace recreation steps
