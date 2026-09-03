#!/usr/bin/env bash
# Runs the whole QA battery against a local static server.
# Prereqs: cd qa && npm install && npx playwright install chromium
#   (or set CHROME_PATH to an existing Chromium binary). QA_URL overrides the app URL.
set -u
cd "$(dirname "$0")"
if ! curl -s -o /dev/null -w '%{http_code}' "${QA_URL:-http://localhost:8123/index.html}" | grep -q 200; then
  (cd .. && nohup python3 -m http.server 8123 >/dev/null 2>&1 &) ; sleep 1
fi
fail=0
run() { echo "== $1"; if node "$1" 2>&1 | grep -v "Failed to load resource\|Geocode error\|^ *at " | grep -E "FAIL|PASS ALL|ALL .*PASS|FATAL|PAGEERROR|distinct errors|violation types|h-scroll" | grep -qE "FAIL|FATAL|PAGEERROR|distinct errors: [1-9]"; then echo "   ✗ $1"; fail=1; else echo "   ✓ $1"; fi; }
for t in smoke.js qa-flows.js qa-merge.js qa-xss.js qa-viewer.js qa-mobile.js qa-viewports.js qa-mobile-save.js qa-sync-e2e.js qa-chat.js qa-routing-cache.js qa-keyboard.js qa-clickall.js qa-a11y.js; do run "$t"; done
if [ -f fn-self-service.js ]; then run test-edge.js; else echo "(edge-function unit test skipped — run: npm run build:edge)"; fi
exit $fail
