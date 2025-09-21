# Task Completion Checklist

When completing a coding task in this project, ensure the following:

## Before Committing
1. **Format code**: Run `deno fmt` to ensure consistent formatting
2. **Lint check**: Run `deno lint` to catch potential issues
3. **Test suite**: Run `deno task test` to verify all tests pass
4. **Type checking**: Ensure no TypeScript errors are present

## Code Quality Checks
- [ ] Follow kebab_case naming for files
- [ ] Place test files alongside implementation with `_test.ts` suffix
- [ ] Use Result types for error handling (no throws in domain core)
- [ ] Implement smart constructors with `parse` prefix for validation
- [ ] Keep modules small and focused
- [ ] Ensure immutability in domain models

## Design Patterns to Follow
- Railway-oriented programming for error handling
- Functional core, imperative shell architecture
- Branded types for domain primitives
- Make illegal states unrepresentable in types

## Final Verification
- All new functionality has corresponding tests
- No commented-out code remains (unless specifically requested)
- Imports are properly ordered (@std → external → relative)
- Domain logic remains pure (no side effects)