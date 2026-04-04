# Product Scope

**Role**: This document defines the **current MVP product boundary and release scope** for mm. For
the domain model and on-disk architecture, see `design.md`.

## Overview

The current MVP direction is to keep mm centered on the existing `task` / `note` / `event` graph,
make the workspace local-first and file-owned, and expose it through a macOS GUI with
agent-assisted knowledge work.

mm is not trying to become a general-purpose RAG platform, autonomous research system, or
large-scale ingest pipeline in its first release.

## MVP Product Statement

On a local mm workspace, users can browse and edit their note/task/event knowledge graph in a macOS
app, and delegate bounded knowledge work to an LLM agent that proposes safe graph changes for
review and apply.

## MVP Value

- The existing mm knowledge graph model
- Local-first ownership
- Agent-assisted knowledge work
- macOS-native GUI

The main differentiator is that knowledge, action, and events live in the same graph.

## In Scope

- Keep the visible item model limited to `note`, `task`, and `event`
- Preserve Markdown/frontmatter files as the canonical workspace state
- Make the macOS app the primary daily interface
- Support bounded agent tasks such as summarization, link suggestion, task suggestion, periodic
  summaries, and organization of related notes
- Design for future multi-client sync with stable IDs, revisions, and conflict-aware persistence

## Out Of Scope

- New top-level item domains such as `source`, `article`, `concept`, or `raw`
- Large-scale ingest, wiki compilation, or generic personal RAG platform features
- Mobile clients
- Cloud runners or cloud-first runtime assumptions
- Team collaboration
- Always-on autonomous agents
- Heavy distributed job orchestration
- Realtime sync, CRDT-grade merge, or fully automatic conflict resolution
- Plugin ecosystem or vector-database-dependent architecture

## Sync Posture

The MVP should be sync-ready, not sync-complete.

- Include stable workspace and item identity
- Include revision-oriented persistence metadata
- Detect local and external changes
- Keep conflict handling explicit rather than hidden last-writer-wins
- Avoid committing to a heavy distributed coordination model in the first release
