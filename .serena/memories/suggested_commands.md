# Development Commands

## Core Tasks
- `deno task start` - Run the CLI entry point once
- `deno task dev` - Run with watch mode for development
- `deno task test` - Execute all unit and integration tests

## Code Quality
- `deno fmt` - Format code according to project standards (2-space indent, 100 column width)
- `deno lint` - Run linter to check code quality

## Testing
- `deno test --allow-read --allow-write` - Run tests with necessary permissions
- `deno test --filter="pattern"` - Run specific tests matching pattern
- `deno test path/to/file_test.ts` - Run tests in specific file

## Type Checking
- `deno check src/main.ts` - Type-check without running

## System Commands (macOS/Darwin)
- `git status` - Check repository status
- `git diff` - View uncommitted changes
- `git log --oneline -10` - View recent commits
- `ls -la` - List files with details
- `find . -name "*.ts"` - Find TypeScript files
- `grep -r "pattern" src/` - Search for pattern in source files

## Development Workflow
1. Make changes to code
2. Run `deno fmt` to format
3. Run `deno lint` to check for issues
4. Run `deno task test` to verify tests pass
5. Commit changes with conventional commit message