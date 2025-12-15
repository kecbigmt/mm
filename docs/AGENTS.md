# Documentation Structure & Usage

**Role**: This document defines the **structure** of `docs/` directory—what goes where, how to name files, and which templates to use. For the development **workflow** (how to develop features step-by-step), see `docs/steering/development-workflow.md`.

## Overview

The `docs/` directory organizes project documentation into three categories:

1. **`docs/steering/`** - Stock-type documents (maintained long-term)
2. **`docs/specs/`** - Past completed Epics (historical reference)
3. **`docs/stories/`** - Flow-type documents (current and future work)

## Directory Structure

```
docs/
  steering/              # Stock-type: long-term maintained documents
    design.md           # Overall project design, philosophy, architecture

  specs/                # Historical: completed Epics (not actively maintained)
    001_redesign/
    002_doctor/
    003_create_task_event/
    004_list/

  stories/              # Flow-type: current Epics and Stories
    EPIC_TEMPLATE.md    # Template for new Epic documents
    STORY_TEMPLATE.md   # Template for new Story documents

    20251206_github-sync/
      20251206T033321_github-sync.epic.md
      20251207T120000_sync-init.story.md
      20251208T140000_auto-commit.story.md

    20251209T150000_refactor-parser.story.md
```

## Document Types

### Stock-type (docs/steering/)

Long-lived documents that are maintained throughout the project lifecycle:
- Project design philosophy
- Architectural Decision Records (ADRs)
- Core principles and guidelines
- Domain models and terminology

**Maintenance**: Keep these documents up-to-date as they represent the current state of the project.

**Reference policy**: Stock-type documents **must not** reference Epic or Story documents, as those are development-time snapshots and may become outdated. All necessary design information must be self-contained within stock-type documents.

### Flow-type (docs/stories/)

Time-stamped documents that capture development work:

#### Epic Documents

Large features or capabilities (e.g., "GitHub Sync").

**File naming**: `<YYYYMMDDTHHMMSS>_<epic-name>.epic.md`
- Example: `20251206T033321_github-sync.epic.md`

**Location**: `docs/stories/<YYYYMMDD>_<epic-name>/`

**Template**: Use `docs/stories/EPIC_TEMPLATE.md`

#### Story Documents

Small, user-focused increments of work.

**File naming**: `<YYYYMMDDTHHMMSS>_<story-name>.story.md`
- Example: `20251207T120000_sync-init.story.md`

**Location**:
- Epic-related: `docs/stories/<epic-dir>/<timestamp>_<story-name>.story.md`
- Standalone: `docs/stories/<timestamp>_<story-name>.story.md`

**Template**: Use `docs/stories/STORY_TEMPLATE.md`

## Naming Conventions

### Timestamps

Use UTC timestamps for all story and epic files:

```bash
date -u +"%Y%m%dT%H%M%S"
# Example output: 20251206T033321
```

### Directory Names

Epic directories use date prefix (YYYYMMDD) without time:

```
20251206_github-sync/
20251215_export-feature/
```

### File Names

Use hyphens to separate words in titles:

```
20251206T033321_github-sync.epic.md
20251207T120000_sync-init.story.md
20251209T150000_refactor-item-parser.story.md
```

## Historical Documents (docs/specs/)

Past Epics remain in `docs/specs/` for historical reference:
- These are not actively maintained
- They document how features were originally designed
- Useful for understanding project evolution
- New work should go in `docs/stories/`

## Document Organization Guidelines

1. **Always use templates**: Start from `EPIC_TEMPLATE.md` or `STORY_TEMPLATE.md`
2. **Always use UTC timestamps**: Ensures consistency across timezones
3. **Epic vs Story**: If it takes multiple stories to complete, it's an Epic
4. **Standalone Stories**: Small refactorings or fixes can be standalone stories outside epic directories

**Command examples:**

```bash
# Create an Epic
cp docs/stories/EPIC_TEMPLATE.md docs/stories/YYYYMMDD_<epic-name>/YYYYMMDDTHHMMSS_<epic-name>.epic.md

# Create a Story
cp docs/stories/STORY_TEMPLATE.md <target-path>
```

## Related Documentation

- **Development Workflow**: See `docs/steering/development-workflow.md` for the complete Story-driven Development process
- **Project Guidelines**: See root `AGENTS.md` for overall project conventions and coding standards
