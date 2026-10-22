#!/usr/bin/env bash
# Fails (exit 1) if anything that looks like a secret is tracked or staged.
# Run before every push: `vpr scan:secrets`
# Scans tracked + staged content only, so the git-ignored .env is never read.
set -euo pipefail

# Google API keys come in two shapes: legacy "AIza..." and newer "AQ...." tokens.
# The first version of this scan only knew "AIza" and would have missed our real key.
patterns=(
  'AIza[0-9A-Za-z_-]{30,}'
  'AQ\.[0-9A-Za-z_-]{30,}'
  'postgres(ql)?://[^[:space:]:@/]+:[^[:space:]@]+@'
  'sk-[A-Za-z0-9_-]{20,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
regex=$(IFS='|'; echo "${patterns[*]}")

status=0

if git ls-files --cached | grep -E '(^|/)\.env(\..+)?$' | grep -v '\.env\.example$'; then
  echo "✗ an .env file is tracked by git" >&2
  status=1
fi

if git grep --cached -nIE "$regex" -- . ':!pnpm-lock.yaml'; then
  echo "✗ possible secret in tracked files (see above)" >&2
  status=1
fi

[ "$status" -eq 0 ] && echo "✓ no secrets found in tracked files"
exit "$status"
