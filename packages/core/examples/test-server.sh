#!/bin/bash

set -e

echo "Starting TAP server..."
bun run examples/server.ts &
SERVER_PID=$!

sleep 2

echo "Testing /health endpoint..."
curl -s http://localhost:3000/health | jq .

echo -e "\nPlacing a hold..."
HOLD_RESPONSE=$(curl -s -X POST http://localhost:3000/hold \
  -H "Content-Type: application/json" \
  -d '{"day":"2025-12-25","startMinute":600,"endMinute":660}')

echo "$HOLD_RESPONSE" | jq .
HOLD_ID=$(echo "$HOLD_RESPONSE" | jq -r '.holdId')

if [ "$HOLD_ID" != "null" ] && [ -n "$HOLD_ID" ]; then
  echo -e "\nChecking availability..."
  curl -s "http://localhost:3000/availability?day=2025-12-25" | jq .

  echo -e "\nConfirming booking..."
  BOOKING_ID=$(ulid)
  curl -s -X POST http://localhost:3000/confirm \
    -H "Content-Type: application/json" \
    -d "{\"holdId\":\"$HOLD_ID\",\"bookingId\":\"$BOOKING_ID\",\"customerEmail\":\"test@example.com\"}" | jq .

  echo -e "\nViewing all events..."
  curl -s http://localhost:3000/events | jq '.events | length'
fi

echo -e "\nCleaning up..."
kill $SERVER_PID 2>/dev/null || true

echo "Done!"

