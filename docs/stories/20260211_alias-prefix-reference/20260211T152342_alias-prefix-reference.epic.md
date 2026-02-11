# Alias Prefix Reference – DESIGN

Status: Draft
Target version: mm v0.x

---

## 0. Scope & Non-Scope

### In Scope (initial release)

* Resolve items by alias prefix
* Prioritize recent items for shorter prefixes
* Display shortest unique prefix
* Error handling for ambiguous prefixes

### Out of Scope (future work)

* UUID prefix resolution
* User-configurable prioritization rules

---

## 1. Motivation & Goals

Currently, mm auto-generates aliases in the format `{cvcv}-{xxx}` (e.g., `bace-x7q`). Users must type the full alias to reference an item.

A short prefix (e.g., `ba`) is often sufficient to uniquely identify an item. Additionally, **users typically work with recent items more frequently**, so recent items should have shorter prefixes for convenience.

Design goals:

1. **Minimal typing**
   Reference items with the shortest unique prefix

2. **Recent items get shorter prefixes**
   Items placed in recent dates (e.g., today, this week) are prioritized with shorter prefixes, similar to jj's `revsets.short-prefixes`

3. **Clear feedback**
   Show candidates when prefix is ambiguous

---

## 2. Terminology

* **Alias** — Auto-generated identifier in `cvcv-xxx` format (e.g., `bace-x7q`)
* **Prefix** — Leading substring of an alias
* **Shortest Unique Prefix** — Minimum prefix that uniquely identifies an alias
* **Priority Set** — Subset of items (recent placements) used for prefix calculation
* **Placement** — The date or location where an item is placed (e.g., `2025-02-11`)

---

## 3. Priority-Based Prefix Calculation

### 3.1 Concept

Instead of calculating shortest prefix against all items, use a **priority set** of recent items:

```
All items:        1000 items → prefixes tend to be long
Priority set:       50 items → prefixes can be short

Item in priority set:     calculated within 50 items → short prefix
Item outside priority set: calculated within 1000 items → long prefix
```

### 3.2 Priority Set Definition

The priority set equals **the default `mm ls` output range**.

```
Priority set = items that would be displayed by `mm ls` (without arguments)
```

This is conceptually similar to jj's default `revsets.short-prefixes`:
```
jj:  revsets.log (configurable)
mm:  mm ls default range (may be configurable in the future)
```

### 3.3 Sort Order within Priority Set

Items in the priority set are sorted by **UUID v7 descending** (newest first).

Since the shortest prefix algorithm compares with adjacent items in the sorted list:
- Newest item has no "previous" neighbor → fewer collisions → shorter prefix
- Older items have more neighbors → more potential collisions → longer prefix

```
Sorted by UUID v7 (newest first):
  [newest]  bacex7q  ← no previous → short prefix possible
            kunop3r
            mizep2r
  [oldest]  bacey2m  ← has both neighbors → may need longer prefix
```

### 3.4 Resolution Behavior

| Item location | Prefix calculated against | Result |
|---------------|--------------------------|--------|
| In priority set | Priority set only | Short prefix |
| Outside priority set | All items | Longer prefix |

When resolving a prefix input:

1. Search in priority set first
2. If no match, search in all items
3. If ambiguous in priority set, return ambiguous (do NOT fall back to all items)

---

## 4. Algorithms

### 4.1 Alias Normalization

Before any comparison, aliases are normalized:

1. Remove hyphens: `bace-x7q` → `bacex7q`
2. Convert to lowercase: `BACE` → `bace`

This allows users to input `bace` or `BACE-X7Q` and match `bace-x7q`.

### 4.2 Shortest Unique Prefix Calculation (for display)

Given a target alias and a sorted list of aliases, calculate the minimum prefix length that uniquely identifies the target.

**Algorithm:**

```
Input:
  - target: the alias to calculate prefix for (normalized)
  - sorted_list: all aliases in the set, sorted alphabetically (normalized)

Steps:
  1. Find target's position in sorted_list
  2. Get previous neighbor (if exists) and next neighbor (if exists)
  3. Calculate common prefix length with each neighbor
  4. Return: max(common_with_prev, common_with_next) + 1

Edge cases:
  - First item in list: no previous neighbor, compare only with next
  - Last item in list: no next neighbor, compare only with previous
  - Single item in list: return 1 (minimum prefix length)
```

**Common prefix length calculation:**

```
Input: two strings A and B
Output: number of characters that match from the start

Example:
  common_prefix_len("bacex7q", "bacey2m") = 4  ("bace")
  common_prefix_len("bacex7q", "kunop3r") = 0  (no common prefix)
```

**Example:**

```
Sorted list: [bacex7q, bacey2m, kunop3r, mizep2r]

For "kunop3r":
  - prev: "bacey2m" → common = 0
  - next: "mizep2r" → common = 0
  - shortest = max(0, 0) + 1 = 1 → prefix "k"

For "bacex7q":
  - prev: none → 0
  - next: "bacey2m" → common = 4 ("bace")
  - shortest = max(0, 4) + 1 = 5 → prefix "bacex"

For "bacey2m":
  - prev: "bacex7q" → common = 4 ("bace")
  - next: "kunop3r" → common = 0
  - shortest = max(4, 0) + 1 = 5 → prefix "bacey"
```

### 4.3 Why UUID v7 Descending Sort Favors Newer Items

When sorted by UUID v7 descending (newest first), the newest item is at position 0.

- Position 0 has no previous neighbor
- Fewer neighbors = fewer potential collisions
- Result: newer items tend to get shorter prefixes

```
Position 0 (newest): compare with next only    → likely short prefix
Position N (oldest): compare with prev & next  → may need longer prefix
```

### 4.4 Prefix Resolution (for user input)

Given a user-input prefix, find the matching item.

**Algorithm:**

```
Input:
  - input: user-provided string
  - priority_set: items in mm ls default range
  - all_items: all items in workspace

Steps:
  1. Normalize input (remove hyphens, lowercase)

  2. Exact match check:
     - If input matches a full alias exactly → return that item

  3. Search in priority set (prefix match):
     - Find all aliases in priority_set starting with input
     - If 1 match → return that item
     - If >1 matches → return AmbiguousMatch error
     - If 0 matches → continue to step 4

  4. Search in all items (prefix match):
     - Find all aliases starting with input
     - If 1 match → return that item
     - If >1 matches → return AmbiguousMatch error
     - If 0 matches → return NoMatch error
```

**Prefix search using binary search:**

For efficient prefix search in a sorted list:

```
Input:
  - prefix: the search prefix (e.g., "ba")
  - sorted_list: alphabetically sorted aliases

Steps:
  1. Binary search: find first index where alias >= prefix
  2. Linear scan: collect all aliases starting with prefix
  3. Stop when alias no longer starts with prefix

Example:
  sorted_list: [aaa, bacex7q, bacey2m, kunop3r, mizep2r]
  prefix: "ba"

  1. Binary search for "ba" → index 1 (bacex7q)
  2. Scan: bacex7q starts with "ba" ✓
          bacey2m starts with "ba" ✓
          kunop3r starts with "ba" ✗ → stop
  3. Result: [bacex7q, bacey2m]
```

### 4.5 Combining Priority Set with Shortest Prefix

When displaying items, the shortest prefix depends on which set the item belongs to:

```
For each item to display:
  1. Is item in priority set?
     - Yes → calculate shortest prefix within priority_set (sorted by UUID v7 desc)
     - No  → calculate shortest prefix within all_items (sorted alphabetically)

  2. Display the calculated prefix
```

This ensures:
- Recent items (in priority set): short prefixes, newest gets shortest
- Old items (outside priority set): longer prefixes to avoid collision with recent items

---

## 5. Prefix Resolution (User-Facing Behavior)

### 5.1 Resolution Priority

1. **Exact alias match** — Full alias `bace-x7q`
2. **Alias prefix match** — Prefix `ba` or `bace`
3. **Exact UUID match** — Full UUID (backward compatibility)

### 5.2 Resolution Results

| Result | Description | Behavior |
|--------|-------------|----------|
| SingleMatch | One alias matches | Return the item |
| AmbiguousMatch | Multiple aliases match | Error with candidate list |
| NoMatch | No alias matches | Error |

### 5.3 Normalization

- Case-insensitive: `BA` = `ba`
- Hyphen optional in prefix: `bace` matches `bace-x7q`

---

## 6. Display

### 6.1 List Display

`mm list` shows the full alias with the shortest unique prefix highlighted (similar to jj):

```
Today:
  • [b]ace-x7q  morning standup
  • [k]uno-3af  review PR

2025-01-15:
  • [bacey]-2m  old task
```

The bracketed portion `[b]`, `[k]`, `[bacey]` indicates the minimum prefix needed to uniquely identify the item. Users can type just that portion to reference the item.

In terminal output, the prefix portion is displayed with a different color (e.g., bold or highlighted) instead of brackets.

---

## 7. Error Handling

### 7.1 Ambiguous Prefix

```
$ mm show bace

Error: Ambiguous prefix 'bace'. Multiple items match:
  bace-x7q  morning standup (today)
  bace-y2m  old task (2025-01-15)

Hint: Use a longer prefix (e.g., 'bacex' or 'bacey')
```

### 7.2 No Match

```
$ mm show xyz

Error: No item found matching 'xyz'
```

---

## 8. Examples

### 8.1 Typical Usage

```bash
# Reference recent item with short prefix
$ mm show b
→ shows "morning standup" (bace-x7q, placed today)

# Reference older item needs longer prefix
$ mm show bacey
→ shows "old task" (bace-y2m, placed 2025-01-15)

# Move using prefixes
$ mm mv b before:k
→ moves "morning standup" before "review PR"
```

### 8.2 Prefix Length Comparison

With 100 total items, 10 in priority set:

| Item | Full alias | In priority set? | Shortest prefix |
|------|-----------|------------------|-----------------|
| Task A | bace-x7q | Yes (newest) | `b` |
| Task B | kuno-3af | Yes | `k` |
| Task C | bace-y2m | No (old) | `bacey` |
| Task D | bizu-p3r | No (old) | `biz` |

---

## 9. Stories

1. **Priority set definition** — Define which items belong to the priority set
2. **Prefix resolution** — Resolve prefix input to item
3. **Shortest prefix calculation** — Calculate display prefix for each item
4. **List display update** — Show prefixes in `mm list`
5. **Error messages** — User-friendly ambiguous/not-found messages
