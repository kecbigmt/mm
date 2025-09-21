# Code Style and Conventions

## Naming Conventions
- **Files**: `kebab_case.ts` (e.g., `item_id.ts`, `workspace_repository.ts`)
- **Test files**: `<implementation>_test.ts` alongside implementation files
- **Exports**: Named exports preferred over default exports
- **Classes/Types**: PascalCase (e.g., `ItemId`, `WorkspaceRepository`)
- **Functions/Methods**: camelCase (e.g., `parseItemId`, `createWorkspace`)
- **Constants**: UPPER_SNAKE_CASE for true constants

## TypeScript Conventions
- Strict mode enabled (`"strict": true`)
- Branded types for domain primitives (using `brand.ts` utilities)
- Smart constructors with `parse` prefix for validation (e.g., `parseItemId`)
- Exhaustive type checking for discriminated unions
- "Make illegal states unrepresentable" principle

## Code Organization
- Small, focused modules with single responsibilities
- Import ordering: `@std` → external → relative paths
- Colocated tests with implementation files
- Pure functions in domain core
- Side effects isolated to infrastructure layer

## Formatting
- 2-space indentation
- 100 character line width
- Deno formatter standards (`deno fmt`)
- No semicolons (Deno style)
- Trailing commas in multi-line arrays/objects

## Error Handling
- Railway-oriented programming with `Result<T, E>` types
- No throwing in domain core (return Result instead)
- Context-rich validation errors via `createValidationError`
- Exhaustive error type discrimination

## Documentation
- Self-documenting code preferred over comments
- NO comments unless explicitly requested by user
- Type signatures and named parameters for clarity
- Examples in test files serve as documentation