# **Task and Event Creation: Implementation Plan**

**Version:** 1.0
**Status:** Draft
**Target:** Add `mm task` and `mm event` commands to create task and event items

---

## Overview

This plan implements task and event creation functionality for mm. The domain model already supports these item types through the `ItemIcon` type and scheduling fields (`startAt`, `duration`, `dueAt`). This plan focuses on:

1. Extending the `CreateItemWorkflow` to handle task/event-specific fields
2. Adding validation for event date/time consistency
3. Creating CLI commands `mm task` and `mm event`

---

## Current State Analysis

### ✅ Already Implemented

The following components are **already in place** and require no changes:

**Domain Primitives:**
- `Duration` (src/domain/primitives/duration.ts) - Parses "1h30m", "2h", "30m" format
- `DateTime` (src/domain/primitives/date_time.ts) - ISO 8601 datetime with timezone support
- `ItemIcon` (src/domain/primitives/item_icon.ts) - Supports "note", "task", "event" values

**Domain Models:**
- `Item` model includes all necessary fields:
  - `startAt?: DateTime` - Event start time
  - `duration?: Duration` - Event duration
  - `dueAt?: DateTime` - Task due date
  - `closedAt?: DateTime` - Completion timestamp
  - `schedule()` method - Updates scheduling fields

**Workflows:**
- `CreateItemWorkflow` (src/domain/workflows/create_item.ts):
  - `CreateItemInput.itemType` already typed as `"note" | "task" | "event"`
  - Uses `createItemIcon(input.itemType)` to set icon

**CLI Infrastructure:**
- `note` command (src/presentation/cli/commands/note.ts) serves as template
- CLI dependencies loading (`loadCliDependencies`)
- Path expression parsing and resolution

### 🔨 Requires Implementation

**1. Workflow Extensions:**
- Add `startAt`, `duration`, `dueAt` fields to `CreateItemInput`
- Implement event date/time consistency validation
- Handle schedule data in item creation

**2. CLI Commands:**
- `mm task [title]` with `--due-at` option
- `mm event [title]` with `--start-at` and `--duration` options
- Reuse existing options: `--body`, `--parent`, `--context`, `--alias`, `--edit`

**3. Validation:**
- Event consistency: if `startAt` provided, its date must match parent placement date
- Duration format validation (already in `Duration` primitive)
- DateTime format validation (already in `DateTime` primitive)

---

## Development Approach

### Test-Driven Development (TDD)

All implementation follows the **Red-Green-Refactor** cycle:

1. **Red** - Write a failing test that defines the expected behavior
2. **Green** - Write the minimum code to make the test pass
3. **Refactor** - Improve code quality while keeping tests green

### TDD Guidelines

- **Start with tests**: Every new function/module begins with a test file
- **Small increments**: Each cycle should be completable in minutes, not hours
- **Test behavior, not implementation**: Focus on inputs/outputs, not internal details
- **Descriptive test names**: Test names should describe the scenario and expected outcome

### Test Organization

```
src/
  domain/
    workflows/
      create_item.ts              # Extended with scheduling support
      create_item_test.ts         # Add task/event test cases
  presentation/
    cli/
      commands/
        task.ts                   # New: mm task command
        task_test.ts              # New: task command tests
        event.ts                  # New: mm event command
        event_test.ts             # New: event command tests

tests/
  e2e/
    scenarios/
      task_creation_test.ts       # New: E2E tests for task creation
      event_creation_test.ts      # New: E2E tests for event creation
```

---

## Task Breakdown

### **Phase 1: Domain Layer Extensions**

#### **Task 1.1: Extend CreateItemWorkflow Input**

**File:** `src/domain/workflows/create_item.ts`

Add scheduling fields to `CreateItemInput`:

```typescript
export type CreateItemInput = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  context?: string;
  alias?: string;
  parentPlacement: Placement;
  createdAt: DateTime;
  // NEW: Scheduling fields
  startAt?: DateTime;
  duration?: Duration;
  dueAt?: DateTime;
}>;
```

**Deliverables:**
- Updated `CreateItemInput` type
- No behavioral changes yet
- Update existing tests to ensure no regression

**Dependencies:** None

**Priority:** HIGH - Foundation for all subsequent tasks

---

#### **Task 1.2: Implement Event Date Consistency Validation**

**File:** `src/domain/workflows/create_item.ts`

Add validation helper for event date/time consistency:

```typescript
type DateConsistencyValidationError = Readonly<{
  kind: "date_consistency";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

const validateEventDateConsistency = (
  startAt: DateTime,
  parentPlacement: Placement,
): Result<void, DateConsistencyValidationError> => {
  // Extract date from startAt
  const startDate = extractDateFromDateTime(startAt);

  // Extract date from placement (if it's a calendar placement)
  const placementDate = extractDateFromPlacement(parentPlacement);

  if (placementDate && startDate !== placementDate) {
    return Result.error({
      kind: "date_consistency",
      message: "event startAt date must match placement date",
      issues: [
        createValidationIssue(
          `startAt date '${startDate}' does not match placement date '${placementDate}'`,
          {
            code: "date_time_inconsistency",
            path: ["startAt"],
          }
        ),
      ],
    });
  }

  return Result.ok(undefined);
};
```

**Implementation Notes:**
- Only validate if `itemType === "event"` and `startAt` is provided
- Only enforce consistency for calendar-based placements (YYYY-MM-DD)
- For item-based placements (UUID), skip date validation

**Test Cases:**
```typescript
Deno.test("validateEventDateConsistency - accepts matching dates", () => {
  const startAt = parseDateTime("2025-01-15T14:00:00Z");
  const placement = parsePlacement("/2025-01-15");
  const result = validateEventDateConsistency(startAt, placement);
  assertEquals(result.type, "ok");
});

Deno.test("validateEventDateConsistency - rejects mismatched dates", () => {
  const startAt = parseDateTime("2025-01-15T14:00:00Z");
  const placement = parsePlacement("/2025-01-16");
  const result = validateEventDateConsistency(startAt, placement);
  assertEquals(result.type, "error");
  assertEquals(result.error.kind, "date_consistency");
});

Deno.test("validateEventDateConsistency - skips validation for item placement", () => {
  const startAt = parseDateTime("2025-01-15T14:00:00Z");
  const placement = parsePlacement("/<some-uuid>");
  const result = validateEventDateConsistency(startAt, placement);
  assertEquals(result.type, "ok");
});
```

**Deliverables:**
- `validateEventDateConsistency` function
- Helper functions: `extractDateFromDateTime`, `extractDateFromPlacement`
- Unit tests (3+ test cases)

**Dependencies:** Task 1.1

**Priority:** HIGH - Critical validation for event creation

---

#### **Task 1.3: Extend CreateItemWorkflow Execution**

**File:** `src/domain/workflows/create_item.ts`

Update `CreateItemWorkflow.execute()` to handle scheduling fields:

**Changes:**

1. **Parse scheduling inputs** (after context/alias parsing):
```typescript
let startAt: DateTime | undefined;
if (input.startAt) {
  // startAt is already a DateTime object, no parsing needed
  startAt = input.startAt;
}

let duration: Duration | undefined;
if (input.duration) {
  // duration is already a Duration object, no parsing needed
  duration = input.duration;
}

let dueAt: DateTime | undefined;
if (input.dueAt) {
  // dueAt is already a DateTime object, no parsing needed
  dueAt = input.dueAt;
}
```

2. **Validate event consistency** (before validation check):
```typescript
if (input.itemType === "event" && startAt) {
  const consistencyResult = validateEventDateConsistency(
    startAt,
    input.parentPlacement
  );
  if (consistencyResult.type === "error") {
    issues.push(...consistencyResult.error.issues);
  }
}
```

3. **Apply schedule to item** (after item creation):
```typescript
let itemWithSchedule = item;
if (startAt || duration || dueAt) {
  itemWithSchedule = item.schedule(
    { startAt, duration, dueAt },
    input.createdAt
  );
}
```

**Test Cases:**
```typescript
Deno.test("CreateItemWorkflow - creates task with dueAt", async () => {
  const dueAt = dateTimeFromDate(new Date("2025-01-20T23:59:59Z"));
  const result = await CreateItemWorkflow.execute({
    title: "Review PR",
    itemType: "task",
    dueAt: dueAt.value,
    parentPlacement: /* ... */,
    createdAt: /* ... */,
  }, deps);

  assertEquals(result.type, "ok");
  assertEquals(result.value.item.data.dueAt, dueAt.value);
});

Deno.test("CreateItemWorkflow - creates event with startAt and duration", async () => {
  const startAt = parseDateTime("2025-01-15T14:00:00Z");
  const duration = parseDuration("2h");
  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt: startAt.value,
    duration: duration.value,
    parentPlacement: parsePlacement("/2025-01-15").value,
    createdAt: /* ... */,
  }, deps);

  assertEquals(result.type, "ok");
  assertEquals(result.value.item.data.startAt, startAt.value);
  assertEquals(result.value.item.data.duration, duration.value);
});

Deno.test("CreateItemWorkflow - rejects event with mismatched startAt date", async () => {
  const startAt = parseDateTime("2025-01-15T14:00:00Z");
  const result = await CreateItemWorkflow.execute({
    title: "Team meeting",
    itemType: "event",
    startAt: startAt.value,
    parentPlacement: parsePlacement("/2025-01-16").value,  // Wrong date
    createdAt: /* ... */,
  }, deps);

  assertEquals(result.type, "error");
  assertEquals(result.error.kind, "validation");
  assert(result.error.issues.some(i => i.code === "date_time_inconsistency"));
});
```

**Deliverables:**
- Extended `CreateItemWorkflow.execute()` implementation
- Schedule field handling
- Event consistency validation integration
- Unit tests (3+ test cases)

**Dependencies:** Task 1.2

**Priority:** HIGH - Core workflow logic

---

### **Phase 2: Presentation Layer - CLI Commands**

#### **Task 2.1: Implement `mm task` Command**

**File:** `src/presentation/cli/commands/task.ts`

Create task creation command based on `note.ts` template:

```typescript
export function createTaskCommand() {
  return new Command()
    .description("Create a new task")
    .arguments("[title:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-b, --body <body:string>", "Body text")
    .option("-p, --parent <parent:string>", "Parent locator (e.g., /2025-11-03, /alias, ./1)")
    .option("-c, --context <context:string>", "Context tag")
    .option("-a, --alias <alias:string>", "Alias for the item")
    .option("-d, --due-at <dueAt:string>", "Due date/time (ISO 8601 format)")
    .option("-e, --edit", "Open editor after creation")
    .action(async (options: Record<string, unknown>, title?: string) => {
      // 1. Load dependencies
      const depsResult = await loadCliDependencies(workspaceOption);

      // 2. Resolve title
      const resolvedTitle = typeof title === "string" && title.trim().length > 0
        ? title
        : "Untitled";

      // 3. Resolve parent placement (reuse from note.ts)
      // 4. Parse dueAt if provided
      let dueAt: DateTime | undefined;
      if (typeof options.dueAt === "string") {
        const dueAtResult = parseDateTime(options.dueAt);
        if (dueAtResult.type === "error") {
          console.error("Invalid due-at format:", dueAtResult.error.issues);
          return;
        }
        dueAt = dueAtResult.value;
      }

      // 5. Execute workflow
      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "task",
        body: bodyOption,
        context: contextOption,
        alias: aliasOption,
        dueAt,
        parentPlacement: parentPlacement,
        createdAt: createdAtResult.value,
      }, deps);

      // 6. Handle result and display
    });
}
```

**Test Cases:**
```typescript
Deno.test("task command - creates task without due date", async () => {
  // Test basic task creation
});

Deno.test("task command - creates task with due date", async () => {
  // Test task with --due-at option
});

Deno.test("task command - rejects invalid due date format", async () => {
  // Test validation error handling
});
```

**Deliverables:**
- `createTaskCommand()` function
- Due date option parsing and validation
- Error handling and user feedback
- Unit tests (3+ test cases)

**Dependencies:** Task 1.3

**Priority:** HIGH - User-facing feature

---

#### **Task 2.2: Implement `mm event` Command**

**File:** `src/presentation/cli/commands/event.ts`

Create event creation command:

```typescript
export function createEventCommand() {
  return new Command()
    .description("Create a new event")
    .arguments("[title:string]")
    .option("-w, --workspace <workspace:string>", "Workspace to override")
    .option("-b, --body <body:string>", "Body text")
    .option("-p, --parent <parent:string>", "Parent locator (e.g., /2025-11-03, /alias, ./1)")
    .option("-c, --context <context:string>", "Context tag")
    .option("-a, --alias <alias:string>", "Alias for the item")
    .option("-s, --start-at <startAt:string>", "Start date/time (ISO 8601 format)")
    .option("-d, --duration <duration:string>", "Duration (e.g., 30m, 2h, 1h30m)")
    .option("-e, --edit", "Open editor after creation")
    .action(async (options: Record<string, unknown>, title?: string) => {
      // 1-3. Load dependencies, resolve title, resolve parent (same as task)

      // 4. Parse startAt if provided
      let startAt: DateTime | undefined;
      if (typeof options.startAt === "string") {
        const startAtResult = parseDateTime(options.startAt);
        if (startAtResult.type === "error") {
          console.error("Invalid start-at format:", startAtResult.error.issues);
          return;
        }
        startAt = startAtResult.value;
      }

      // 5. Parse duration if provided
      let duration: Duration | undefined;
      if (typeof options.duration === "string") {
        const durationResult = parseDuration(options.duration);
        if (durationResult.type === "error") {
          console.error("Invalid duration format:", durationResult.error.issues);
          return;
        }
        duration = durationResult.value;
      }

      // 6. Execute workflow
      const workflowResult = await CreateItemWorkflow.execute({
        title: resolvedTitle,
        itemType: "event",
        body: bodyOption,
        context: contextOption,
        alias: aliasOption,
        startAt,
        duration,
        parentPlacement: parentPlacement,
        createdAt: createdAtResult.value,
      }, deps);

      // 7. Handle result - check for date consistency errors
      if (workflowResult.type === "error") {
        if (workflowResult.error.kind === "validation") {
          const hasDateConsistency = workflowResult.error.issues.some(
            i => i.code === "date_time_inconsistency"
          );
          if (hasDateConsistency) {
            console.error("Event date/time consistency error:");
            console.error("The start time's date must match the parent placement date.");
          }
          console.error(workflowResult.error.message);
          reportValidationIssues(workflowResult.error.issues);
        }
        return;
      }

      // 8. Display success message
    });
}
```

**Test Cases:**
```typescript
Deno.test("event command - creates event without start time", async () => {
  // Test basic event creation
});

Deno.test("event command - creates event with start time and duration", async () => {
  // Test event with --start-at and --duration
});

Deno.test("event command - rejects mismatched startAt date", async () => {
  // Test date consistency validation
});

Deno.test("event command - accepts event with item-based placement", async () => {
  // Test that validation is skipped for non-date placements
});
```

**Deliverables:**
- `createEventCommand()` function
- Start time and duration option parsing
- Date consistency error handling with user-friendly messages
- Unit tests (4+ test cases)

**Dependencies:** Task 1.3

**Priority:** HIGH - User-facing feature

---

#### **Task 2.3: Register Commands in Main CLI**

**File:** `src/main.ts`

Register new commands in main CLI:

```typescript
import { createNoteCommand } from "./presentation/cli/commands/note.ts";
import { createTaskCommand } from "./presentation/cli/commands/task.ts";
import { createEventCommand } from "./presentation/cli/commands/event.ts";

await new Command()
  .name("mm")
  .description("Personal knowledge management CLI")
  // ... existing commands
  .command("note", createNoteCommand())
  .command("n", createNoteCommand())  // Alias
  .command("task", createTaskCommand())
  .command("t", createTaskCommand())  // Alias
  .command("event", createEventCommand())
  .command("ev", createEventCommand())  // Alias
  // ... more commands
  .parse(Deno.args);
```

**Deliverables:**
- Command registration
- Command aliases (`t` for `task`, `ev` for `event`)
- Help text verification

**Dependencies:** Tasks 2.1, 2.2

**Priority:** MEDIUM - Integration step

---

### **Phase 3: Testing & Documentation**

#### **Task 3.1: E2E Test Scenarios - Tasks**

**File:** `tests/e2e/scenarios/task_creation_test.ts`

End-to-end tests for task creation:

```typescript
Deno.test("mm task - creates task in today", async () => {
  // Create task without options
});

Deno.test("mm task - creates task with due date", async () => {
  // Create task with --due-at
});

Deno.test("mm task - creates task in specific parent", async () => {
  // Create task with --parent option
});

Deno.test("mm task - creates task with all metadata", async () => {
  // Create task with --body, --context, --alias, --due-at
});
```

**Deliverables:**
- Comprehensive E2E test suite for tasks
- Coverage of success and error paths
- Verification of file creation and frontmatter

**Dependencies:** Task 2.1, 2.3

**Priority:** MEDIUM

---

#### **Task 3.2: E2E Test Scenarios - Events**

**File:** `tests/e2e/scenarios/event_creation_test.ts`

End-to-end tests for event creation:

```typescript
Deno.test("mm event - creates event in today", async () => {
  // Create event without options
});

Deno.test("mm event - creates event with start time and duration", async () => {
  // Create event with --start-at and --duration
});

Deno.test("mm event - rejects event with mismatched date", async () => {
  // Verify date consistency validation
  // startAt date != parent date should fail
});

Deno.test("mm event - creates event in item-based placement", async () => {
  // Create event with parent as item UUID
  // Date consistency should not be enforced
});

Deno.test("mm event - creates event with all metadata", async () => {
  // Create event with full metadata
});
```

**Deliverables:**
- Comprehensive E2E test suite for events
- Coverage of success and error paths
- Date consistency validation testing

**Dependencies:** Task 2.2, 2.3

**Priority:** MEDIUM

---

#### **Task 3.3: Documentation Updates**

**Files:**
- `README.md`
- `docs/steering/design.md` (if needed)

Update documentation:

**README.md additions:**

```markdown
### Creating Items

#### Notes
```bash
mm note "Meeting notes" --body "Discussed Q1 roadmap"
mm n "Quick idea"  # Alias
```

#### Tasks
```bash
mm task "Review PR" --due-at "2025-01-20T17:00:00Z"
mm t "Fix bug" --context work  # Alias
```

#### Events
```bash
mm event "Team meeting" --start-at "2025-01-15T14:00:00Z" --duration 2h
mm ev "Lunch" --start-at "2025-01-15T12:00:00Z" --duration 1h  # Alias
```

**Options:**
- `-b, --body <text>` - Item body content
- `-p, --parent <path>` - Parent container (default: today)
- `-c, --context <tag>` - Context tag
- `-a, --alias <slug>` - Human-readable alias
- `-e, --edit` - Open editor after creation

**Task-specific:**
- `-d, --due-at <datetime>` - Due date/time (ISO 8601)

**Event-specific:**
- `-s, --start-at <datetime>` - Start date/time (ISO 8601)
- `-d, --duration <duration>` - Duration (e.g., 30m, 2h, 1h30m)

**Note:** For events, if `--start-at` is provided, its date portion must match the parent placement date.

**Deliverables:**
- Updated README with task/event examples
- CLI option documentation
- Date consistency constraint documentation

**Dependencies:** Tasks 2.1, 2.2

**Priority:** LOW - Can be done last

---

## Task Dependencies Visualization

```
Phase 1 (Domain Layer - Sequential):
  1.1 Extend CreateItemInput type
  1.2 Implement date consistency validation
  1.3 Extend CreateItemWorkflow execution

Phase 2 (Presentation Layer - Parallel):
  2.1 Implement mm task command ───┐
  2.2 Implement mm event command ──┤
                                   ├──> 2.3 Register commands in main CLI
                                   │
Phase 3 (Testing & Docs - Parallel after 2.3):
  3.1 E2E tests for tasks ─────────┐
  3.2 E2E tests for events ────────┤
  3.3 Documentation updates ───────┴──> Complete
```

**Parallelization opportunities:**
- Tasks 2.1 and 2.2 can be developed in parallel after 1.3
- Tasks 3.1, 3.2, and 3.3 can be done in parallel after 2.3

---

## Success Criteria

### **Phase 1 Complete:**

- [ ] `CreateItemInput` includes `startAt`, `duration`, `dueAt` fields
- [ ] Event date consistency validation implemented and tested
- [ ] `CreateItemWorkflow` handles scheduling fields correctly
- [ ] All domain layer unit tests pass (8+ new tests)

### **Phase 2 Complete:**

- [ ] `mm task` command creates tasks with optional `--due-at`
- [ ] `mm event` command creates events with optional `--start-at` and `--duration`
- [ ] Commands registered in main CLI with aliases
- [ ] All presentation layer unit tests pass (7+ new tests)

### **Phase 3 Complete:**

- [ ] E2E tests cover task creation scenarios (4+ tests)
- [ ] E2E tests cover event creation scenarios (5+ tests)
- [ ] README documentation updated with examples

### **Overall Success:**

- [ ] `deno task test` passes
- [ ] `deno lint` passes
- [ ] `deno fmt --check` passes
- [ ] Can create tasks: `mm task "Review PR" --due-at "2025-01-20T17:00:00Z"`
- [ ] Can create tasks with alias: `mm t "Fix bug"`
- [ ] Can create events: `mm event "Meeting" --start-at "2025-01-15T14:00:00Z" --duration 2h`
- [ ] Can create events with alias: `mm ev "Lunch"`
- [ ] Event date consistency is enforced for calendar placements
- [ ] Event date consistency is NOT enforced for item placements
- [ ] All metadata options work for both tasks and events

---

## Implementation Notes

### Prototype Differences

The mm-prototype had these features that are **not included** in this plan:

1. **Automatic date inference from startAt**: In prototype, if no date was provided but startAt was, the date would be extracted from startAt. **Decision: Skip for simplicity.** Users must specify parent placement explicitly.

2. **Title parsing for inline metadata**: Prototype parsed `+project`, `@context`, `.date` from title. **Decision: Skip for now.** Can be added later as enhancement.

3. **MCP server integration**: Prototype had MCP tools for creating tasks/events. **Decision: Not in scope.** Will be addressed separately when MCP server is implemented.

### Design Decisions

1. **Calendar vs Item Placements**: Date consistency validation only applies to calendar-based placements (e.g., `/2025-01-15`). For item-based placements (e.g., `/<uuid>`), the validation is skipped since there's no canonical date to compare against.

2. **Scheduling Fields Optional**: All scheduling fields (`startAt`, `duration`, `dueAt`) are optional. This allows creating tasks/events without scheduling info initially.

3. **No Status Computation**: Unlike prototype which had automatic status computation for events (past vs future), we keep status simple (open/closed). Time-based status can be added later.

---

**End of plan.**
