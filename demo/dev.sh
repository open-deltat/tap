#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export DELTAT_PASSWORD="${DELTAT_PASSWORD:-secret}"

# Find deltat binary: $DELTAT_BIN, PATH, or cargo install location
DELTAT_BIN="${DELTAT_BIN:-$(command -v deltat 2>/dev/null || echo "")}"
if [ -z "$DELTAT_BIN" ] && [ -f "$HOME/.cargo/bin/deltat" ]; then
    DELTAT_BIN="$HOME/.cargo/bin/deltat"
fi

if [ -z "$DELTAT_BIN" ]; then
    echo "Error: deltat binary not found."
    echo "Install it: cargo install --git https://github.com/open-tap/deltat.git"
    echo "Or set DELTAT_BIN=/path/to/deltat"
    exit 1
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

# Start Next.js dev server (foreground)
cd "$SCRIPT_DIR"
exec bunx next dev
