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
  npm install "@open-deltat/client@$RANGE" typescript@5 --silent >/dev/null 2>&1

  # The APIs the adapters call, checked on the REGISTRY copy by importing it, not on the workspace.
  # Each entry names the adapters that call it, so an adapter's range is held to what that adapter
  # uses: the MCP needing a newer client must not fail the CLI, whose range is older on purpose.
  # Add a line when an adapter starts using a new one.
  ADAPTER="$ADAPTER" node --input-type=module - <<'NODE'
const client = await import('@open-deltat/client')
const method = (cls, name) => typeof client[cls]?.prototype?.[name] === 'function'
const fn = (name) => typeof client[name] === 'function'
const BOTH = ['mcp', 'cli']

const required = [
  [() => method('Holds', 'commit'), 'Holds.commit  (the CLI turns a hold into a booking with it)', ['cli']],
  [() => method('Holds', 'commitMany'), 'Holds.commitMany  (the only way the MCP turns holds into bookings)', ['mcp']],
  [() => method('Holds', 'place'), 'Holds.place', ['cli']],
  [() => method('Holds', 'placeMany'), 'Holds.placeMany  (hold_slot holds one calendar or a kit with it)', ['mcp']],
  [() => method('Holds', 'release'), 'Holds.release', ['mcp']],
  [() => method('Holds', 'get'), 'Holds.get', ['cli']],
  [() => method('Holds', 'getMany'), 'Holds.getMany', ['mcp']],
  [() => method('Bookings', 'cancel'), 'Bookings.cancel', ['mcp']],
  [() => method('Bookings', 'get'), 'Bookings.get', BOTH],
  [() => method('Availability', 'get'), 'Availability.get', ['cli']],
  [() => method('Availability', 'getCombined'), 'Availability.getCombined  (find_slots, and a refused kit\'s alternatives)', ['mcp']],
  [() => method('Resources', 'find'), 'Resources.find  (the CLI refuses an unknown calendar with it)', ['cli']],
  [() => method('Events', 'watch'), 'Events.watch  (deltat-cli watch)', ['cli']],
  [() => fn('classifyRefusal'), 'classifyRefusal  (both adapters report refusals through it)', BOTH],
  [() => fn('sqlstateOf'), 'sqlstateOf  (a refused kit says whether waiting could help)', ['mcp']],
  [() => fn('parseInstant'), 'parseInstant', BOTH],
  [() => fn('tlsSetting'), 'tlsSetting  (DELTAT_TLS / DELTAT_TLS_CA, read the same way by both adapters)', BOTH],
  [() => fn('passwordInClear'), 'passwordInClear', BOTH],
  [() => typeof client.ADAPTER_DEFAULTS?.port === 'number', 'ADAPTER_DEFAULTS  (where both adapters connect by default)', BOTH],
]

const adapter = process.env.ADAPTER
const mine = required.filter(([, , adapters]) => adapters.includes(adapter))
const missing = mine.filter(([present]) => {
  try { return !present() } catch { return true }
})

if (missing.length) {
  console.error(`FAIL: the published client is missing APIs that packages/${adapter} calls:\n`)
  for (const [, label] of missing) console.error(`  - ${label}`)
  console.error('\nBump and publish @open-deltat/client first, then raise the range in')
  console.error(`packages/${adapter}/package.json. Publishing as-is ships an adapter that throws.`)
  process.exit(1)
}

console.log(`OK: every runtime API packages/${adapter} calls is in the published client (${mine.length} checked).`)
NODE

  # Types have nothing to import, so the compiler checks them against the published declarations:
  # a snippet that uses the type the way the adapters do must compile.
  type_check() {
    printf '%s\n' "$2" > type-check.ts
    if ! npx --no-install tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler type-check.ts >/dev/null 2>&1; then
      echo "FAIL: the published client is missing a type packages/$ADAPTER relies on: $1"
      echo "      Bump and publish @open-deltat/client first, then raise the range in packages/$ADAPTER/package.json."
      exit 1
    fi
  }
  type_check 'DeltaTOptions.tls  (or DELTAT_TLS is silently ignored and the password goes out in the clear)' \
    'import type { DeltaTOptions } from "@open-deltat/client"; export const tls: DeltaTOptions["tls"] = { ca: "" };'
  type_check 'RecurrencePattern.timeZone  (or availability expands in the host zone)' \
    'import type { RecurrencePattern } from "@open-deltat/client"; export const zone: RecurrencePattern["timeZone"] = "Europe/Berlin";'
  echo "OK: the types the adapters rely on compile against the published client (2 checked)."
done
