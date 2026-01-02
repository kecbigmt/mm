# Permanent Notes & Project/Context Tags – DESIGN

Status: Draft (Work in Progress)
Target version: mm v0.x

---

## 0. Scope & Non-Scope

### In Scope (initial release)

* **Permanent placement**: Items can be placed outside the date hierarchy (`placement: "permanent"`)
* **Project field**: Items can reference another Item as their project (`project?: AliasSlug`)
* **Contexts field**: Items can reference multiple Items as contexts (`contexts?: AliasSlug[]`)
* **Auto-creation**: When referencing a non-existent alias as project/context, automatically create a permanent Item
* **Listing**: `mm ls permanent` to list all permanent Items
* **Moving**: `mm mv <item> permanent` to make an Item permanent
* CLI options: `--project`, `--context` (multiple) on note/task/event/edit commands

### Out of Scope (future work)

* Tag management commands (`mm tag create/delete/list`) - replaced by permanent Items
* Filtering by project/context in `mm ls` (e.g., `mm ls --project deep-work`)
* Hierarchical project relationships (project of a project)
* Migration of existing `context` field to new `contexts` array

---

## 1. Motivation & Goals

The current mm design lacks a way to represent **persistent, date-independent knowledge** and **GTD-style project/context organization**. This epic unifies these concepts by:

1. Allowing any Item to exist outside the date hierarchy (Zettelkasten's permanent notes)
2. Enabling Items to reference other Items as projects or contexts (GTD workflow)
3. Keeping the model simple: no new "kind" - just Items with different placements

Design goals:

1. **Unified model**
   Items are Items. A "tag" is just an Item with `placement: "permanent"` and an alias. No separate Tag entity needed.

2. **GTD compatibility**
   - `project`: single (one Item belongs to one project)
   - `contexts`: multiple (one Item can have multiple contexts like @office, @computer, @30min)

3. **Zettelkasten compatibility**
   Permanent Items can hold rich content (body), acting as permanent notes that other Items reference.

4. **Minimal change to existing model**
   Extend `PlacementHead` with a new kind, add two fields to Item. No breaking changes.

---

## 2. Terminology

* **Permanent Item** — An Item with `placement: "permanent"`. Not bound to any date. Typically has an alias for easy reference.
* **Project** — A Permanent Item referenced by other Items via the `project` field. Represents a GTD project or area of responsibility.
* **Context** — A Permanent Item referenced by other Items via the `contexts` field. Represents a GTD context (@office, @computer, etc.).
* **Periodic Item** — An Item with date-based placement. The default for notes/tasks/events created with `mm note/task/event`.

---

## 3. Domain Model Changes

### 3.1 PlacementHead Extension

Current:
```typescript
type PlacementHead =
  | { kind: "date"; date: CalendarDay }
  | { kind: "item"; id: ItemId };
```

New:
```typescript
type PlacementHead =
  | { kind: "date"; date: CalendarDay }
  | { kind: "item"; id: ItemId }
  | { kind: "permanent" };  // NEW
```

Serialization: `placement: "permanent"` (literal string in frontmatter)

### 3.2 Item Fields

Current:
```typescript
type ItemData = {
  // ...existing fields...
  context?: TagSlug;  // single context
};
```

New:
```typescript
type ItemData = {
  // ...existing fields...
  project?: AliasSlug;     // single project reference (NEW)
  contexts?: AliasSlug[];  // multiple context references (RENAMED & CHANGED)
};
```

Note: `context` (singular) is renamed to `contexts` (plural) and changed to array.

### 3.3 Physical File Location

Permanent Items are still stored under `items/YYYY/MM/DD/<uuid>.md` based on their creation date. The `placement: "permanent"` field makes them logically independent of the date hierarchy.

This preserves:
- UUID v7 timestamp → file location mapping
- Git-friendly date partitioning
- No special directories needed

---

## 4. User-Facing Changes

### 4.1 New/Modified Commands

**Creating permanent Items:**
```bash
mm note "Deep Work" --placement permanent
mm note "Deep Work" --placement permanent --alias deep-work
```

**Moving to permanent:**
```bash
mm mv my-note permanent
```

**Listing permanent Items:**
```bash
mm ls permanent
```

**Creating Items with project/contexts:**
```bash
mm task "Buy the book" --project deep-work
mm task "Call John" --project home-renovation --context phone --context errands
mm note "Meeting notes" --context work
```

**Editing project/contexts:**
```bash
mm edit my-task --project new-project
mm edit my-task --context office --context computer
mm edit my-task --project ""  # clear project
```

### 4.2 Auto-creation Behavior

When `--project` or `--context` references an alias that doesn't exist:

1. Create a new permanent Item with:
   - `placement: "permanent"`
   - `alias: <referenced-alias>`
   - `title: <referenced-alias>` (alias as title)
   - `icon: "note"`
   - `status: "open"`
2. Then create/update the original Item with the reference

Example:
```bash
mm task "Research options" --project home-renovation
# If "home-renovation" doesn't exist:
# 1. Creates permanent note with alias "home-renovation", title "home-renovation"
# 2. Creates task with project: "home-renovation"
```

### 4.3 List Display

```bash
mm ls permanent
```

Output:
```
permanent
  📝 deep-work        Deep Work
  📝 home-renovation  Home Renovation
  📝 office           Office (context)
```

```bash
mm ls 2025-01-02
```

Output (with project/contexts shown):
```
2025-01-02
  ☑️ buy-book    Buy the book @deep-work
  📝 notes       Meeting notes #work #office
```

Display format TBD:
- `@project` for project reference
- `#context` for context references (or keep `@context`?)

---

## 5. Implementation Notes

### 5.1 Placement Parsing

Update `parsePlacement()` to accept literal `"permanent"`:

```typescript
if (trimmed === "permanent") {
  return Result.ok(instantiate({ kind: "permanent" }, []));
}
```

### 5.2 Index Structure

`.index/graph/permanent/` directory for permanent Items:

```
.index/graph/
  dates/
    2025-01-02/
      <uuid>.edge.json
  parents/
    <uuid>/
      <child-uuid>.edge.json
  permanent/           # NEW
    <uuid>.edge.json
```

### 5.3 Alias Resolution

When resolving `--project deep-work`:

1. Look up alias "deep-work" → get ItemId
2. Verify the Item exists
3. If not exists and auto-create enabled → create permanent Item
4. Store `project: "deep-work"` in frontmatter (alias string, not UUID)

### 5.4 Validation

- `project` must reference an existing alias (or trigger auto-create)
- `contexts` elements must each reference existing aliases (or trigger auto-create)
- Circular references: Item cannot be its own project/context (TBD: deeper cycle detection?)

---

## 6. Error Handling & Edge Cases

### 6.1 Invalid Alias Reference

If auto-creation is disabled and alias doesn't exist:
```
Error: Project "deep-work" not found. Use --create-missing to auto-create.
```

(TBD: Should auto-creation be default or opt-in?)

### 6.2 Moving Permanent Item to Date

```bash
mm mv deep-work 2025-01-02
```

This is allowed. The Item becomes a regular date-bound Item. References from other Items (project/contexts) remain valid (they reference by alias, alias stays).

### 6.3 Deleting Referenced Item

If a permanent Item is deleted but other Items reference it:
- Option A: Prevent deletion (referential integrity)
- Option B: Allow deletion, leave dangling references (doctor can detect)

TBD: Which approach?

---

## 7. Testing Strategy

* Unit tests for `PlacementHead` with `kind: "permanent"`
* Unit tests for `parsePlacement("permanent")`
* Unit tests for Item with `project` and `contexts` fields
* Integration tests for auto-creation workflow
* E2E tests for CLI commands: `--project`, `--context`, `mm ls permanent`, `mm mv <item> permanent`
* Validation tests for circular reference detection

---

## 8. Migration & Compatibility

### 8.1 Existing `context` Field

Current Items may have `context: "some-value"` (singular). Migration options:

1. **Automatic migration**: On read, convert `context` to `contexts: [context]`
2. **Schema version bump**: New schema version handles both formats
3. **Manual migration**: `mm doctor migrate-contexts`

TBD: Which approach?

### 8.2 Existing Tag Infrastructure

The existing `TagRepository`, `Tag` model, and `tags/` directory become obsolete. They can be:

1. Removed entirely (breaking change, but project not yet released)
2. Kept for backward compatibility during transition

Since project is not yet released, removal is preferred.

---

## 9. Open Questions

1. **Display format**: `@project` vs `#project` vs other notation?
2. **Auto-creation default**: Always auto-create or require flag?
3. **Deletion policy**: Prevent or allow deleting referenced Items?
4. **Context field migration**: Auto-migrate or explicit command?
5. **Section support**: Can permanent Items have sections? (`permanent/1`, `permanent/2`)

---

## 10. Story Breakdown (Draft)

1. **PlacementHead extension**: Add `kind: "permanent"` to domain model
2. **Item fields**: Add `project` and rename `context` to `contexts` (array)
3. **Index structure**: Add `.index/graph/permanent/` handling
4. **CLI: placement option**: `--placement permanent` for note/task/event
5. **CLI: project/contexts options**: `--project`, `--context` for note/task/event/edit
6. **CLI: ls permanent**: List permanent Items
7. **CLI: mv <item> permanent**: Move Item to permanent placement
8. **Auto-creation**: Create permanent Items on missing alias reference
9. **Remove old Tag infrastructure**: Clean up TagRepository, Tag model, tags/ directory
10. **Migration**: Handle existing `context` field
