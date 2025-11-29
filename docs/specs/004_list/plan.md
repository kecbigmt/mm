# mm ls (range-aware) — Implementation Plan (LLM-friendly)

## Guardrails
- Keep tasks small enough to fit typical LLM context; avoid multi-file mega-diffs in one shot.
- Preserve domain/presentation separation: workflows return sorted items; partitioning/formatting live in presentation.
- Respect limits: section/date cap = 100, item-head events warn+skip, SectionQuery failures are fatal.

## Workstream A: Domain contracts & services (serial, then parallelizable tests)
1. Add SectionQueryService interface + SectionSummary type (placement + counts) under `src/domain/services/`.
2. Add infrastructure stub/implementation file skeleton (reads index) — can be placeholder if out of scope, but signature must compile.
3. Update dependencies loader wiring to expose SectionQueryService to CLI (if needed).
4. Unit tests for the interface wiring (compile-level; minimal runtime).

## Workstream B: CLI path/range + workflow integration (mostly serial)
1. Ensure `ListItemsWorkflow` still returns flat, filtered, sorted items; no partitioning. (Validate no change needed or adjust signature to include status/type inputs already designed.)
2. `ls` command plumbing: call PathResolver, ItemRepository, SectionQueryService; enforce caps (100), skip item-head events with warning count, fail on SectionQuery errors.
3. Wire warnings to stderr; honor `--all`, `--type`, `--no-pager`, `--print`, workspace override.

## Workstream C: Partitioning utility (independent after B.2 contracts clear)
1. Create `src/presentation/cli/partitioning/build_partitions.ts`:
   - Inputs: `items`, `range`, `sections`, `limit=100`.
   - Outputs: partitions DTO + warnings (range truncations, skipped item-head events count).
   - Logic: per-prefix partitioning for item-head ranges; date-head grouping; omit empty prefixes; generate stub lines from SectionSummary (non-empty only); apply caps (section/date).
2. Unit tests for cap truncation, stub emission, empty omission, item-head event skipping, and mixed date/item ranges.

## Workstream D: Formatting utility (independent after partition DTO shape settles)
1. Create `src/presentation/cli/formatters/list_formatter.ts`:
   - Icon-first, alias-first; note closed=🗞️, task closed=✅, events 🕒…; workspace TZ for times.
   - Date headers with relative labels; print vs colored modes; stubs shown in both (no color in print).
2. Unit tests: icon mapping, alias/UUID fallback, date headers, stub formatting, print mode (no ANSI).

## Workstream E: CLI command integration & E2E smoke (serial after C/D ready)
1. Update `src/presentation/cli/commands/ls.ts` to use partition builder + formatter; handle pager/no-pager/print.
2. E2E-like CLI tests (with pager disabled): default listing, item-head range (cap/warning), task filter `--all --print`, event under date head, CWD `mm ls .`, item-head event omitted+warning.

## Parallelization notes
- A can run first; once SectionQueryService interface exists, B/C/D can proceed in parallel.
- C and D are independent of each other; both depend only on DTO shapes and limits decided.
- E waits on B/C/D integration surfaces.

## Testing approach
- Follow TDD (red/green/refactor) for partition builder, formatter, and CLI surfaces.
- Pager behavior is unit-tested with mocked process spawn; E2E runs with pager disabled (`--no-pager`/`--print`).
- Fixtures should cover item-head ranges with stubs, date ranges with caps, event under date head, and warning paths (item-head events, range truncation).

## Definition of Done
- All new tests passing (unit + CLI/e2e smoke), using red/green/refactor steps.
- `docs/specs/004_list/design.md` matched (caps 100, event policy, item-head range behavior, stub rules).
- Warnings/emissions align with examples; SectionQuery failure aborts `mm ls`.
