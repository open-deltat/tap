#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export DELTAT_PASSWORD="${DELTAT_PASSWORD:-secret}"

DELTAT_REPO="https://github.com/open-deltat/deltat"
DELTAT_VERSION_CACHE="$HOME/.cache/deltat-version"

# Find deltat binary: $DELTAT_BIN, PATH, or cargo install location
DELTAT_BIN="${DELTAT_BIN:-$(command -v deltat 2>/dev/null || echo "")}"
if [ -z "$DELTAT_BIN" ] && [ -f "$HOME/.cargo/bin/deltat" ]; then
    DELTAT_BIN="$HOME/.cargo/bin/deltat"
fi

# Track the published crate, which is the server the SDK ships against and what CI installs.
# The old check read a VERSION file that no longer exists in the deltat repo, so it always came
# back empty and an already-installed binary was never upgraded again.
# crates.io rejects requests without a User-Agent, and curl -f hides that as an empty body.
REMOTE_VERSION=$(curl -sf -H "User-Agent: deltat-demo-dev-script" "https://crates.io/api/v1/crates/deltat" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["crate"]["max_version"])' 2>/dev/null || echo "")
LOCAL_VERSION=$(cat "$DELTAT_VERSION_CACHE" 2>/dev/null || echo "")

if [ -z "$DELTAT_BIN" ] || { [ -n "$REMOTE_VERSION" ] && [ "$REMOTE_VERSION" != "$LOCAL_VERSION" ]; }; then
    if [ -n "$REMOTE_VERSION" ]; then
        echo "Installing deltat v${REMOTE_VERSION}..."
        cargo install deltat --version "$REMOTE_VERSION" --locked --force
    else
        echo "crates.io unreachable; installing deltat from git..."
        cargo install --git "$DELTAT_REPO" --force
    fi
    DELTAT_BIN="$HOME/.cargo/bin/deltat"
    mkdir -p "$(dirname "$DELTAT_VERSION_CACHE")"
    echo "$REMOTE_VERSION" > "$DELTAT_VERSION_CACHE"
fi

# Start deltat server in background
echo "Starting deltat server ($DELTAT_BIN)..."
"$DELTAT_BIN" &
DELTAT_PID=$!

cleanup() {
    echo ""
    echo "Stopping deltat server (pid $DELTAT_PID)..."
    kill "$DELTAT_PID" 2>/dev/null
    wait "$DELTAT_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Wait for deltat to be ready
for i in $(seq 1 30); do
    if lsof -iTCP:"${DELTAT_PORT:-5433}" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "deltat ready on port ${DELTAT_PORT:-5433}"
        break
    fi
    sleep 0.1
done

# Start custom server (foreground)
cd "$SCRIPT_DIR"
exec bun run server.ts
