#!/bin/bash
# Stop hook: Run format check, lint, and type check

cd "$CLAUDE_PROJECT_DIR" || exit 0

errors=""

# Format check
if ! deno fmt --check 2>&1; then
  errors+="Format issues found. Run 'deno fmt' to fix.\n"
fi

# Lint
lint_output=$(deno lint 2>&1)
if [ $? -ne 0 ]; then
  errors+="Lint issues found:\n$lint_output\n"
fi

# Type check
check_output=$(deno check src/main.ts 2>&1)
if [ $? -ne 0 ]; then
  errors+="Type check failed:\n$check_output\n"
fi

if [ -n "$errors" ]; then
  echo -e "$errors" >&2
  exit 2
fi

exit 0
