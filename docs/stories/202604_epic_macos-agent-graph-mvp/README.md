---
status: planning
started: 2026-04
target: 2026-07
---

# macOS Agent Graph MVP

**Role**: This document defines the current development-time scope, goals, and sequencing for the
macOS-first agent-assisted MVP. For the domain model and architecture baseline, see
`docs/steering/design.md`.

## Goal

Deliver the first usable mm product as a **single-user, local-first, macOS app** that works on top
of the existing `task` / `note` / `event` knowledge graph and can delegate bounded knowledge work to
an LLM agent.

## MVP Product Statement

On a local mm workspace, users can browse and edit their note/task/event knowledge graph in a macOS
app, and delegate bounded knowledge work to an LLM agent that proposes safe graph changes for review
and apply.

## MVP Value

- The existing mm knowledge graph model
- Local-first ownership
- Agent-assisted knowledge work
- macOS-native GUI

The main differentiator is that knowledge, action, and events live in the same graph.

## In Scope

- macOS app as the primary daily client
- local-first workspace with user-owned files as source of truth
- note/task/event graph browsing and editing
- agent-assisted workflows such as summarize, suggest links, suggest tasks, and periodic summaries
- preserve compatibility with the existing GitHub-based multi-client sync workflow
- keep stable IDs, revisions, and conflict-aware save behavior aligned with file-based sync
- core APIs reusable from multiple presentation layers

## Out of Scope

- iOS or Android clients
- new top-level item domains such as `source`, `article`, or `concept`
- cloud sync backend, team collaboration, or cloud runner
- heavy ingest pipelines, generic RAG platform features, or autonomous research orchestration
- realtime sync, CRDT-grade merge, or fully automatic conflict resolution
- plugin ecosystem

## Sync Posture

The MVP must preserve the existing GitHub-based multi-client sync workflow.

- Keep Markdown/frontmatter files as the canonical state exchanged through Git
- Preserve compatibility with pull/rebase/push-based multi-client operation
- Keep stable workspace and item identity and revision-oriented persistence metadata
- Detect local and external changes without hiding conflicts behind implicit last-writer-wins
- Avoid introducing a new cloud-first or distributed sync architecture in the first release

## Success Criteria

- The macOS app can open a workspace and use shared core APIs instead of shelling out to CLI flows.
- The same core can serve both CLI and structured local APIs without duplicating domain logic.
- Agent results can be previewed and applied as persistent graph changes.
- The MVP scope remains centered on local knowledge work over `task` / `note` / `event`.
- macOS/core changes do not regress the existing GitHub-based multi-client sync workflow.

## Planned Features

- `feature_core-cli-json-rpc-separation`
- `feature_macos-workspace-shell`
- `feature_macos-list-detail-editor`
- `feature_agent-preview-and-apply`
- `feature_sync-ready-item-metadata`

## Initial Sequencing

1. Separate shared core from CLI-specific presentation concerns.
2. Introduce a structured local API suitable for a SwiftUI client.
3. Build the macOS workspace shell on top of that API.
4. Add editing, graph navigation, and agent preview/apply flows.

## Notes

- Detailed stories are intentionally deferred until the core boundary and presentation split are
  agreed.
- This epic should prefer additive seams and removal of architectural coupling over broad feature
  work in the first pass.
- Existing sync behavior is a compatibility constraint, not a future aspiration.
