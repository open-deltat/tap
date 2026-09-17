#!/usr/bin/env bash
# Assert that @open-deltat/mcp's DECLARED dependency range resolves, from the public registry, to a
# client that actually contains the APIs the server calls.
#
# Why this exists. Every other check in this repo resolves @open-deltat/client through the workspace
# symlink, so they all test the local source no matter what range package.json declares. On
# 2026-09-17 that hid a shipped-breaking defect: the registry's 0.2.1 had no `Holds.commit`, because
# two commits landed in the client without a version bump, while `server.ts` calls
# `dt.holds.commit(...)` in the tool whose description says "This is the only way to create a
# booking". Publishing would have shipped an MCP server whose only booking verb threw a TypeError.
#
# This script deliberately does NOT run prepublishOnly on install, because that rebuilds the
# workspace dependency and reintroduces exactly the blindness it is here to remove.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RANGE="$(node -p "require('$ROOT/packages/mcp/package.json').dependencies['@open-deltat/client']")"
echo "declared range: @open-deltat/client@$RANGE"

if [[ "$RANGE" == workspace:* ]]; then
  echo "FAIL: the range is '$RANGE'. npm pack does not rewrite the workspace protocol, so a package"
  echo "      published with npm would be uninstallable. Use a plain semver range."
  exit 1
fi

# No published match is the expected state between bumping the client and publishing it, so it is
# not a merge blocker. It IS a publish blocker, and it fails loudly at install time (ETARGET) rather
# than silently at call time, which is the whole point of the bump. RELEASING.md gates on the OK.
if ! npm view "@open-deltat/client@$RANGE" version >/dev/null 2>&1; then
  echo
  echo "PENDING: no published @open-deltat/client satisfies '$RANGE' yet."
  echo "         Publish the client BEFORE @open-deltat/mcp. Publishing mcp first leaves"
  echo "         'npx @open-deltat/mcp' failing at install with ETARGET until the client lands."
  exit 0
fi

RESOLVED="$(npm view "@open-deltat/client@$RANGE" version | tail -1)"
echo "resolves to: $RESOLVED"

cd "$WORK"
npm init -y >/dev/null 2>&1
npm install "@open-deltat/client@$RANGE" --silent >/dev/null 2>&1

# The APIs packages/mcp/src/server.ts actually calls. Add a line here when the server starts using
# a new one; the point is that this list is checked against the REGISTRY copy, not the workspace.
node - <<'NODE'
const { readFileSync } = require('node:fs')
const dts = (p) => readFileSync(`node_modules/@open-deltat/client/dist/${p}`, 'utf8')

const required = [
  ['holds.d.ts', /\bcommit\s*\(/, 'Holds.commit  (the only way to turn a hold into a booking)'],
  ['holds.d.ts', /\bplace\s*\(/, 'Holds.place'],
  ['holds.d.ts', /\brelease\s*\(/, 'Holds.release'],
  ['recurrence.d.ts', /timeZone\??:/, 'RecurrencePattern.timeZone  (or availability expands in the host zone)'],
  ['bookings.d.ts', /\bcancel\s*\(/, 'Bookings.cancel'],
  ['availability.d.ts', /\bget\s*\(/, 'Availability.get'],
]

const missing = required.filter(([file, re]) => {
  try { return !re.test(dts(file)) } catch { return true }
})

if (missing.length) {
  console.error('FAIL: the published client is missing APIs that packages/mcp calls:\n')
  for (const [, , label] of missing) console.error(`  - ${label}`)
  console.error('\nBump and publish @open-deltat/client first, then raise the range in')
  console.error('packages/mcp/package.json. Publishing as-is ships a server whose tools throw.')
  process.exit(1)
}

console.log(`OK: the published client satisfies every API packages/mcp calls (${required.length} checked).`)
NODE
