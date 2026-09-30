#!/usr/bin/env bash
# Assert that each adapter's DECLARED dependency range (@open-deltat/mcp, @open-deltat/cli) resolves,
# from the public registry, to a client that actually contains the APIs the adapters call.
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

for ADAPTER in mcp cli; do
  RANGE="$(node -p "require('$ROOT/packages/$ADAPTER/package.json').dependencies['@open-deltat/client']")"
  echo
  echo "packages/$ADAPTER declares @open-deltat/client@$RANGE"

  if [[ "$RANGE" == workspace:* ]]; then
    echo "FAIL: the range is '$RANGE'. npm pack does not rewrite the workspace protocol, so a package"
    echo "      published with npm would be uninstallable. Use a plain semver range."
    exit 1
  fi

  # No published match is the expected state between bumping the client and publishing it, so it is
  # not a merge blocker. It IS a publish blocker, and it fails loudly at install time (ETARGET)
  # rather than silently at call time, which is the whole point of the bump. RELEASING.md gates on
  # the OK.
  if ! npm view "@open-deltat/client@$RANGE" version >/dev/null 2>&1; then
    echo "PENDING: no published @open-deltat/client satisfies '$RANGE' yet."
    echo "         Publish the client BEFORE @open-deltat/$ADAPTER. Publishing it first leaves its"
    echo "         install failing with ETARGET until the client lands."
    continue
  fi
  echo "resolves to: $(npm view "@open-deltat/client@$RANGE" version | tail -1)"

  DIR="$WORK/$ADAPTER"
  mkdir -p "$DIR"
  cd "$DIR"
  npm init -y >/dev/null 2>&1
  npm install "@open-deltat/client@$RANGE" --silent >/dev/null 2>&1

  # The APIs the adapters call, checked on the REGISTRY copy by importing it, not on the workspace.
  # Add a line when an adapter starts using a new one.
  ADAPTER="$ADAPTER" node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs'

const client = await import('@open-deltat/client')
const method = (cls, name) => typeof client[cls]?.prototype?.[name] === 'function'
const fn = (name) => typeof client[name] === 'function'

const required = [
  [() => method('Holds', 'commit'), 'Holds.commit  (the only way to turn a hold into a booking)'],
  [() => method('Holds', 'place'), 'Holds.place'],
  [() => method('Holds', 'release'), 'Holds.release'],
  [() => method('Holds', 'get'), 'Holds.get'],
  [() => method('Bookings', 'cancel'), 'Bookings.cancel'],
  [() => method('Bookings', 'get'), 'Bookings.get'],
  [() => method('Availability', 'get'), 'Availability.get'],
  [() => method('Resources', 'find'), 'Resources.find  (the CLI refuses an unknown calendar with it)'],
  [() => method('Events', 'watch'), 'Events.watch  (deltat-cli watch)'],
  [() => fn('classifyRefusal'), 'classifyRefusal  (both adapters report refusals through it)'],
  [() => fn('parseInstant'), 'parseInstant'],
  [() => fn('tlsSetting'), 'tlsSetting  (DELTAT_TLS / DELTAT_TLS_CA, read the same way by both adapters)'],
  [() => fn('passwordInClear'), 'passwordInClear'],
  // Types, so there is nothing to import: read from the published declarations.
  [
    () => /timeZone\??:/.test(readFileSync('node_modules/@open-deltat/client/dist/recurrence.d.ts', 'utf8')),
    'RecurrencePattern.timeZone  (or availability expands in the host zone)',
  ],
  [
    () => /tls\??:/.test(readFileSync('node_modules/@open-deltat/client/dist/client.d.ts', 'utf8')),
    'DeltaTOptions.tls  (or DELTAT_TLS is silently ignored and the password goes out in the clear)',
  ],
]

const missing = required.filter(([present]) => {
  try { return !present() } catch { return true }
})
const adapter = process.env.ADAPTER

if (missing.length) {
  console.error(`FAIL: the published client is missing APIs that packages/${adapter} calls:\n`)
  for (const [, label] of missing) console.error(`  - ${label}`)
  console.error('\nBump and publish @open-deltat/client first, then raise the range in')
  console.error(`packages/${adapter}/package.json. Publishing as-is ships an adapter that throws.`)
  process.exit(1)
}

console.log(`OK: the published client satisfies every API the adapters call (${required.length} checked).`)
NODE
done
