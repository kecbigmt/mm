# Tasks — Item/Section Redesign

## Phase 1 — Canonical primitives & utilities

- [ ] Introduce `CanonicalKey` helper (NFKC + casefold) with comprehensive tests
- [ ] Define `HashingService` interface in `src/domain/services` and wire SHA-256 implementation
      under infrastructure
- [ ] Replace alias/context primitives with `{ raw, canonicalKey }` value objects and update
      model/tests accordingly
- [ ] Update tag primitives/repositories to use canonical keys with hashed storage paths
- [ ] Implement auto-alias generator (CVCV-base36 fallback) aligned with Appendix C
- [ ] Add Section primitives (`section_path.ts`, `section_segment.ts`) with validation logic

## Phase 2 — Placement-first domain model

- [x] Remove `ContainerPath` from active item data; make `Placement` the sole logical location
- [x] Model section trees explicitly (sections containing subsections and item edges)
- [x] Delete legacy container models/repositories/tests that depend on container paths
- [x] Update workflows and services to operate exclusively on the new placement structure

## Phase 3 — Filesystem adapters & storage layout

- [x] Introduce the new `items/YYYY/MM/DD/<item-id>/` layout with per-section edge directories
- [x] Remove short-ID index usage; persist hashed canonical alias/tag entries under `.index` and
      `tags`
- [x] Ensure item `meta.json` stores only raw alias while indexes handle canonical metadata
- [x] Update workspace bootstrap to create the new scaffold and refresh repository tests

## Phase 4 — Locator parsing & resolution services

- [ ] Implement locator parser supporting dates, UUID v7, aliases, and section suffixes
- [ ] Replace `ItemResolutionService` usage with new `LocatorResolutionService`; remove short-ID
      branches
- [ ] Delete short-ID primitives, repository methods, and CLI affordances once new locator
      resolution is in place
- [ ] Add parser and resolution tests covering relative tokens and range validation

## Phase 5 — Workflows & CLI experience

- [ ] Update create/move/list workflows to operate on placements and new locator semantics
- [ ] Extend CLI commands (`mm cd`, `mm ls`, `mm where`, `mm mv`, etc.) to use locator parsing and
      section ranges
- [ ] Manage logical CWD state (`MM_CWD`, ancestor fallback) and expose helper subcommands
- [ ] Add fixtures/snapshot tests demonstrating logical navigation and range handling

## Phase 6 — Migration & doctor tooling

- [ ] Extend `mm doctor` checks for canonical alias collisions, placement consistency, and provide
      `--reindex` for LexoRank compaction
- [ ] Update documentation to describe new layout, locators, and manual workspace recreation steps
