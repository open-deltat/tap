# TAP E2E Example Server

A simple HTTP server demonstrating the TAP v0.1 core functionality.

## Running the Server

```bash
bun run example:server
```

Or directly:

```bash
bun run examples/server.ts
```

## Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{ "status": "ok" }
```

### `POST /hold`
Place a hold on a time slot.

**Request Body:**
```json
{
  "day": "2025-12-25",
  "startMinute": 600,
  "endMinute": 660,
  "expiresAtMs": 1735128000000
}
```

**Response (201):**
```json
{
  "holdId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "event": { ... }
}
```

**Response (409):** Slot not available

### `POST /confirm`
Confirm a booking from a hold.

**Request Body:**
```json
{
  "holdId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "bookingId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "customerEmail": "customer@example.com",
  "priceCents": 5000
}
```

**Response (200):**
```json
{
  "event": { ... }
}
```

**Response (404):** Hold not found or expired

### `GET /availability?day=2025-12-25`
Get availability for a specific day.

**Response:**
```json
{
  "day": "2025-12-25",
  "available": true,
  "booked": [600, 601, 602],
  "held": [630, 631]
}
```

### `GET /events`
Get all events from the event store.

**Response:**
```json
{
  "events": [ ... ]
}
```

### `POST /expire`
Manually trigger hold expiry.

**Response:**
```json
{
  "expired": 2,
  "holdIds": ["01ARZ3NDEKTSV4RRFFQ69G5FAV", ...]
}
```

## Example Usage

```bash
# Place a hold
curl -X POST http://localhost:3000/hold \
  -H "Content-Type: application/json" \
  -d '{"day":"2025-12-25","startMinute":600,"endMinute":660}'

# Check availability
curl http://localhost:3000/availability?day=2025-12-25

# Confirm booking
curl -X POST http://localhost:3000/confirm \
  -H "Content-Type: application/json" \
  -d '{"holdId":"...","bookingId":"..."}'

# View all events
curl http://localhost:3000/events
```

