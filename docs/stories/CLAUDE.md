# Stories Directory Guide

**Role**: This document defines the **directory model and naming rules** for `docs/stories/`. For
global documentation policy, length limits, and stock-vs-flow guidance, see `docs/AGENTS.md`. For
the implementation workflow, see `docs/steering/development-workflow.md`.

## Purpose

Use `docs/stories/` to manage development work as epics, features, stories, specs, and ADRs.

The hierarchy is:

```text
epic > feature > story
```

- **Epic**: a multi-month goal or theme made of multiple features.
- **Feature**: a multi-week, independently releasable capability made of multiple stories.
- **Story**: a multi-day, implementation-sized unit that should fit in one pull request.
- **Spec**: a shared specification spanning multiple stories or features.
- **ADR**: an Architecture Decision Record that captures technical decisions and their rationale.

## Layout

```text
docs/stories/
├── CLAUDE.md
├── AGENTS.md -> CLAUDE.md
├── YYYYMM_epic_epic-name/
│   ├── README.md
│   ├── spec_spec-name.md
│   ├── adr_adr-name.md
│   ├── feature_feature-name/
│   │   ├── README.md
│   │   ├── spec_spec-name.md
│   │   ├── adr_adr-name.md
│   │   └── story_story-name.md
│   └── feature_another-feature/
├── YYYYMMDD_feature_feature-name/
│   └── README.md
├── YYYYMMDDTHHmm_story_story-name.md
└── YYYYMMDDTHHmm_adr_adr-name.md
```

## Naming Rules

### Epic directory

Format: `YYYYMM_epic_epic-name/`

- `YYYYMM`: UTC start month for stable sorting
- `epic`: fixed literal
- `epic-name`: kebab-case name describing the goal

Example: `202602_epic_learning-loop-mvp/`

### Feature directory inside an epic

Format: `feature_feature-name/`

- `feature`: fixed literal
- `feature-name`: kebab-case
- No date prefix: feature folders should stay stable even if sequencing changes

Example: `feature_course-lecture-management/`

### Standalone feature directory

Format: `YYYYMMDD_feature_feature-name/`

- `YYYYMMDD`: UTC creation date
- `feature`: fixed literal
- `feature-name`: kebab-case

Example: `20260207_feature_hotfix-login-bug/`

### Story file inside a feature

Format: `story_story-name.md`

- `story`: fixed literal
- `story-name`: kebab-case

Example: `story_create-course-api.md`

### Standalone story file

Format: `YYYYMMDDTHHmm_story_story-name.md`

- `YYYYMMDDTHHmm`: UTC creation timestamp, minute precision
- `story`: fixed literal
- `story-name`: kebab-case

Example: `20260207T0930_story_fix-cors-config.md`

### Spec file

Format: `spec_spec-name.md`

- `spec`: fixed literal
- `spec-name`: kebab-case
- Place it at the epic root or inside a feature based on the scope it governs

Example: `spec_api-error-format.md`

### ADR file

ADR records why a technical decision was made, including alternatives, tradeoffs, rejected options,
and risks. Specs describe what to build; ADRs explain why a technical direction was chosen.

Epic or feature scoped format: `adr_adr-name.md`

Standalone format: `YYYYMMDDTHHmm_adr_adr-name.md`

Examples:

- `adr_database-infrastructure-setup.md`
- `20260124T2358_adr_domain-model-design.md`

## Frontmatter

### Epic

```yaml
---
status: ongoing
started: 2026-02
target: 2026-04
---
```

- `status`: `planning | ongoing | completed`

### Feature

```yaml
---
status: planning
depends:
  - feature_authentication
  - feature_course-lecture-management
---
```

- `status`: `planning | ongoing | completed`
- `depends`: optional feature dependencies

### Story

```yaml
---
status: draft
depends:
  - story_create-course-api
syncs:
  - story_frontend-course-list
  - spec_api-error-format
---
```

- `status`: `draft | ready | in-progress | done`
- `depends`: optional prerequisite stories
- `syncs`: optional parallel documents that must stay aligned

### Spec

```yaml
---
syncs:
  - story_create-course-api
  - story_frontend-course-list
---
```

## Dependency And Sync Rules

Use frontmatter, not table order, to express relationships.

- `depends`: a sequencing constraint; listed work should be completed first
- `syncs`: a consistency constraint; listed work should be reviewed together when one changes

Examples:

```yaml
---
depends:
  - feature_authentication
---
```

```yaml
---
syncs:
  - story_frontend-course-list
  - spec_api-error-format
---
```

## Timestamp Commands

```bash
date -u +%Y%m
date -u +%Y%m%d
date -u +%Y%m%dT%H%M
```

## Design Principles

1. Folder names are immutable once created.
2. Mutable state belongs in frontmatter, not in file or folder names.
3. Sequencing and phases belong in Epic `README.md`, not in feature directory names.
4. Use descriptive names as identifiers; do not use serial labels like `A1` or `Phase-2`.
