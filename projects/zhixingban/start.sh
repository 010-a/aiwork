#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Install Node.js 22 LTS (22.12 or newer) with npm: https://nodejs.org/' >&2
  exit 1
fi
if ! node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"; then
  echo 'Node.js 22.12 or newer is required.' >&2
  exit 1
fi

node scripts/ensure-dependencies.mjs

npm run build
echo 'Open http://127.0.0.1:5173 in your regular browser. Press Ctrl+C to stop.'
echo 'If port 5173 is occupied, use the existing window or stop the other server.'
node scripts/open-browser.mjs &
exec npm run preview
