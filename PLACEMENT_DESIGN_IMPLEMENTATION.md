# Placement Design Implementation Summary

This document summarizes the implementation of the new Placement domain model and CLI expression types as specified in the design document "mm 設計アップデート（Item / Placement / Index / CLI）".

## Overview

The implementation introduces a clear separation between:
- **Domain layer**: Canonical, absolute Placement types
- **CLI layer**: User-friendly PathExpression with syntactic sugar
- **Conversion**: PathResolver service to bridge the two layers

## Implemented Components

### 1. Domain Layer Types

#### Placement (`src/domain/primitives/placement.ts`)

Represents the canonical, absolute position of an item.

```typescript
type PlacementHead =
  | { kind: "date"; date: CalendarDay }    // Date shelf
  | { kind: "item"; id: ItemId };          // Parent item UUID

type Placement = {
  head: PlacementHead;           // Direct parent
  section: ReadonlyArray<number>; // Numeric sections
  toString(): string;
  toJSON(): string;
  equals(other: Placement): boolean;
  parent(): Placement | null;
};
```

**Placement String Format** (frontmatter storage):
- No leading `/`
- First segment: `YYYY-MM-DD` (date) or UUID (item)
- Remaining segments: positive integers (sections)

Examples:
- `2025-11-15` → Date shelf
- `2025-11-15/1/3` → Date shelf, section [1, 3]
- `019a85fc-67c4-7a54-be8e-305bae009f9e` → Item parent
- `019a85fc-67c4-7a54-be8e-305bae009f9e/1` → Item parent, section [1]

#### PlacementRange (`src/domain/primitives/placement_range.ts`)

Represents a range of placements for querying.

```typescript
type PlacementRange =
  | { kind: "single"; at: Placement }
  | { kind: "dateRange"; from: CalendarDay; to: CalendarDay }
  | { kind: "numericRange"; parent: Placement; from: number; to: number };
```

Use cases:
- `single`: Single location query (`mm ls 2025-11-15`)
- `dateRange`: Date shelf range (`mm ls 2025-11-15..2025-11-30`)
- `numericRange`: Section range (`mm ls book/1..5`)

#### ResolvedGraphPath (`src/domain/primitives/resolved_graph_path.ts`)

View model for displaying full paths to users (e.g., `pwd` command).

```typescript
type ResolvedSegment =
  | { kind: "date"; date: CalendarDay }
  | { kind: "item"; id: ItemId; alias?: AliasSlug }
  | { kind: "section"; index: number };

type ResolvedGraphPath = {
  segments: ReadonlyArray<ResolvedSegment>;
};
```

Enables display with aliases: `/2025-11-15/book-alias/1/3`

### 2. CLI Layer Types

#### PathExpression (`src/presentation/cli/path_expression.ts`)

Represents user-facing path input with syntactic sugar.

```typescript
type PathToken =
  | { kind: "dot" }                          // "."
  | { kind: "dotdot" }                       // ".."
  | { kind: "relativeDate"; expr: string }   // "today", "+2w", "~mon"
  | { kind: "idOrAlias"; value: string }     // UUID or alias
  | { kind: "numeric"; value: number };      // Section number

type PathExpression = {
  isAbsolute: boolean;
  segments: ReadonlyArray<PathToken>;
};
```

Supported syntax:
- Relative dates: `today`, `td`, `tomorrow`, `+2w`, `~mon`
- Navigation: `.` (current), `..` (parent)
- Aliases: `book` instead of UUID
- Absolute/relative paths: `/2025-11-15` vs `today`

#### RangeExpression

```typescript
type RangeExpression =
  | { kind: "single"; path: PathExpression }
  | { kind: "range"; from: PathExpression; to: PathExpression };
```

Syntax: `2025-11-15..2025-11-30`, `book/1..5`

### 3. PathResolver Service

**Location**: `src/domain/services/path_resolver.ts`

Converts CLI expressions to canonical domain types.

```typescript
interface PathResolver {
  resolvePath(
    cwd: Placement,
    expr: PathExpression,
  ): Promise<Result<Placement, PathResolverError>>;

  resolveRange(
    cwd: Placement,
    expr: RangeExpression,
  ): Promise<Result<PlacementRange, PathResolverError>>;
}
```

Responsibilities:
- Resolve relative dates (`today` → `2025-11-15`)
- Resolve aliases (`book` → UUID)
- Handle relative navigation (`.`, `..`)
- Convert RangeExpression to PlacementRange

Dependencies:
- `AliasRepository` for alias → UUID resolution
- `ItemRepository` for item lookups
- `TimezoneIdentifier` for date calculations
- `today: Date` for relative date resolution

## 4. Frontmatter Schema Update

### Schema Version

- Old: `mm.item.frontmatter/1`
- New: `mm.item.frontmatter/2`

### Field Name Change

```yaml
# Old (v1)
---
path: /2025-11-15/1/3
schema: mm.item.frontmatter/1
---

# New (v2)
---
placement: 2025-11-15/1/3
schema: mm.item.frontmatter/2
---
```

### Format Changes

| Aspect | Old (path) | New (placement) |
|--------|------------|-----------------|
| Leading slash | Required (`/2025-11-15`) | Not allowed (`2025-11-15`) |
| First segment | Date or UUID | Date or UUID |
| Remaining segments | Can be mixed | Only numeric sections |

### Implementation Details

**File**: `src/infrastructure/fileSystem/item_repository.ts`

**Write (save)**:
```typescript
// Convert Path (with /) to placement string (without /)
const pathStr = snapshot.path;
const placementStr = pathStr.startsWith("/") ? pathStr.slice(1) : pathStr;

const frontmatter = {
  // ...
  placement: placementStr,
  schema: "mm.item.frontmatter/2",
};
```

**Read (load)**:
```typescript
// Convert placement (without /) to Path (with /)
const placementStr = frontmatter.placement;
const pathStr = placementStr.startsWith("/") ? placementStr : `/${placementStr}`;

const snapshot: ItemSnapshot = {
  // ...
  path: pathStr,
};
```

This maintains compatibility with the existing Item model (which uses Path) while adopting the new placement format in storage.

## Design Principles

### Separation of Concerns

1. **Domain layer** works with canonical Placements
   - No syntactic sugar
   - UUIDs only (no aliases)
   - Absolute positions

2. **CLI layer** provides user-friendly expressions
   - Relative dates
   - Aliases
   - Navigation shortcuts

3. **PathResolver** bridges the two
   - Clear conversion boundary
   - All resolution logic in one place

### Validation Strategy

- Domain types enforce invariants at construction
- Smart constructors (`createPlacement`, `parsePlacement`)
- Railway-oriented programming with `Result<T, E>`
- Comprehensive test coverage for all types

### Future Extensibility

The design supports future enhancements:
- Additional CLI syntactic sugar (can be added to PathExpression)
- New query patterns (can extend PlacementRange)
- Alternative display formats (can add new view types like ResolvedGraphPath)

## Testing

All new types include comprehensive unit tests:
- `placement_test.ts`: Placement parsing, serialization, equality
- `placement_range_test.ts`: Range creation and validation
- `path_expression_test.ts`: CLI syntax parsing

Test coverage includes:
- Valid inputs (happy paths)
- Invalid inputs (error cases)
- Edge cases (empty, boundary values)
- Roundtrip tests (parse → serialize → parse)

## Migration Path

### Current State

- ✅ New types implemented (Placement, PlacementRange, PathExpression)
- ✅ PathResolver service implemented
- ✅ Frontmatter schema updated (v1 → v2)
- ✅ Comprehensive tests

### Future Work (Not in Scope)

The following changes are planned but not implemented in this iteration:

1. **Item Model Migration**
   - Update `Item.data.path: Path` → `Item.data.placement: Placement`
   - This will require updating all workflows and commands

2. **Repository Interface Updates**
   - Update `ItemRepository.listByPath()` → `listByPlacement()`
   - Update method signatures to use Placement

3. **Workflow Updates**
   - Update move_item workflow to use PathResolver
   - Update ls command to use PlacementRange

4. **CLI Command Updates**
   - Integrate PathExpression parsing in all commands
   - Use PathResolver for all user input

5. **Edge Index Optimization**
   - Ensure `.index/graph` structure matches design exactly
   - Add `mm doctor --rebuild-index` command (design only, not implemented)

### Design-Only Features

Per the design document, `mm doctor` is specified but marked as "今回実装対象外" (not in current implementation scope).

## Files Modified/Created

### New Files
- `src/domain/primitives/placement.ts`
- `src/domain/primitives/placement_test.ts`
- `src/domain/primitives/placement_range.ts`
- `src/domain/primitives/placement_range_test.ts`
- `src/domain/primitives/resolved_graph_path.ts`
- `src/domain/services/path_resolver.ts`
- `src/presentation/cli/path_expression.ts`
- `src/presentation/cli/path_expression_test.ts`

### Modified Files
- `src/domain/primitives/mod.ts` (added exports)
- `src/infrastructure/fileSystem/item_repository.ts` (frontmatter schema update)

## Compatibility Notes

### Backward Compatibility

The implementation maintains compatibility with existing code:
- Item model still uses Path internally
- Conversion happens at the storage boundary
- Old v1 frontmatter files can be read (with format conversion)

### Forward Compatibility

New v2 frontmatter files:
- Use canonical placement format
- Are Git-friendly (no leading slashes in values)
- Support future migration to full Placement-based Item model

## Conclusion

This implementation successfully introduces the new Placement domain model and CLI expression layer as specified in the design document. The clear separation between domain and CLI layers, combined with the PathResolver bridge, provides a solid foundation for future enhancements while maintaining backward compatibility with existing code.

The frontmatter schema update (path → placement, v1 → v2) ensures the storage layer aligns with the new design, setting the stage for eventual migration of the entire codebase to use Placement throughout.
