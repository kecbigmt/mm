#!/bin/bash
set -e

# Documentation length checker
# Checks all AGENTS.md, CLAUDE.md, GEMINI.md files and docs/steering/*.md files
# for line count and token count limits

echo "Checking documentation length limits..."
echo "Tokens (primary) - Target: ≤1000, Maximum: ≤2500 (fails)"
echo "Lines (secondary) - Target: ≤100, Warning at: 250+"
echo ""

FAIL=0

# Check if uv is available
if ! command -v uv &> /dev/null; then
    echo "❌ uv is required but not installed."
    echo "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Create Python script for token counting
cat > /tmp/count_tokens.py << 'PYTHON_SCRIPT'
import sys
import tiktoken

def count_tokens(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        enc = tiktoken.get_encoding("cl100k_base")
        tokens = enc.encode(content)
        return len(tokens)
    except Exception as e:
        print(f"Error counting tokens: {e}", file=sys.stderr)
        return -1

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: count_tokens.py <file>", file=sys.stderr)
        sys.exit(1)
    count = count_tokens(sys.argv[1])
    if count >= 0:
        print(count)
    else:
        sys.exit(1)
PYTHON_SCRIPT

# Find all AGENTS.md, CLAUDE.md, GEMINI.md files (anywhere) and docs/steering/*.md files
FILES=$(
  {
    find . \( -name "AGENTS.md" -o -name "CLAUDE.md" -o -name "GEMINI.md" \) \
      -not -path "*/node_modules/*" -not -path "*/.git/*"
    find docs/steering -name "*.md" 2>/dev/null
  } | sort
)

if [ -z "$FILES" ]; then
  echo "⚠️  No documentation files found to check"
  rm -f /tmp/count_tokens.py
  exit 0
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Remove leading ./ for cleaner output
  clean_file="${file#./}"

  if [ -f "$file" ]; then
    lines=$(wc -l < "$file")
    tokens=$(uv run --with tiktoken python /tmp/count_tokens.py "$file")

    line_status="✅"
    token_status="✅"
    overall_status="✅"

    # Check lines (warnings only, no failure)
    if [ $lines -gt 250 ]; then
      line_status="⚠️ "
    fi

    # Check tokens (can cause failure)
    if [ $tokens -gt 2500 ]; then
      token_status="❌"
      overall_status="❌"
      FAIL=1
    elif [ $tokens -gt 1000 ]; then
      token_status="⚠️ "
    fi

    echo "$overall_status $clean_file:"
    echo "   Lines:  $line_status $lines"
    echo "   Tokens: $token_status $tokens"
  else
    echo "⚠️  SKIP: $clean_file not found"
  fi
done <<< "$FILES"

# Cleanup
rm -f /tmp/count_tokens.py

echo ""
if [ $FAIL -eq 1 ]; then
  echo "❌ Documentation check FAILED"
  echo "Documents exceeding 2500 tokens must be split into multiple focused documents."
  exit 1
else
  echo "✅ Documentation check PASSED"
fi
