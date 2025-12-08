# TAP Protocol Specification

**Version:** 0.1.0
**Status:** Draft

TAP Protocol defines the HTTP and WebSocket bindings for TAP Core.

---

## Transport

- **HTTP/1.1 or HTTP/2** for request-response
- **WebSocket** for real-time streaming
- **JSON** for all payloads
- **UTF-8** encoding

---

## Discovery

Servers MUST expose:

```
GET /.well-known/timebook.json
```

Response:

```json
{
  "version": "0.1.0",
  "endpoints": {
    "availability": "/availability",
    "book": "/book",
    "cancel": "/cancel",
    "holds": "/hold-ws",
    "events": "/availability-ws"
  }
}
```

---

## Endpoints

### Query Availability

```
POST /availability
```

Request:

```json
{
  "tenantId": "string",
  "resourceId": "string",
  "from": 1234567890000,
  "to": 1234567890000
}
```

Response:

```json
{
  "slots": [
    {
      "slotId": "2025-01-01T09:00:00.000Z_2025-01-01T10:00:00.000Z",
      "start": 1234567890000,
      "end": 1234567890000,
      "available": true
    }
  ],
  "cursor": "string"
}
```

### Create Booking

```
POST /book
```

Request:

```json
{
  "tenantId": "string",
  "resourceId": "string",
  "holdId": "string (optional)",
  "slotId": "string",
  "customer": {
    "name": "string (optional)",
    "email": "string (optional)",
    "phone": "string (optional)"
  }
}
```

Response:

```json
{
  "bookingId": "string",
  "status": "CONFIRMED"
}
```

### Cancel Booking

```
POST /cancel
```

Request:

```json
{
  "tenantId": "string",
  "resourceId": "string",
  "bookingId": "string"
}
```

Response:

```json
{
  "success": true
}
```

### Health

```
GET /health
```

Response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": 1234567890000
}
```

---

## WebSocket: Holds

```
ws://{host}/hold-ws?tenantId={}&resourceId={}
```

### Client → Server

**Place Hold:**
```json
{
  "type": "hold.place",
  "slotId": "string"
}
```

**Release Hold:**
```json
{
  "type": "hold.release",
  "holdId": "string"
}
```

### Server → Client

**Hold Confirmed:**
```json
{
  "type": "hold.placed",
  "holdId": "string",
  "slotId": "string",
  "expiresAt": 1234567890000
}
```

**Hold Released:**
```json
{
  "type": "hold.released",
  "holdId": "string"
}
```

**Hold Expired:**
```json
{
  "type": "hold.expired",
  "holdId": "string"
}
```

**Error:**
```json
{
  "type": "hold.error",
  "code": "SLOT_UNAVAILABLE",
  "message": "string"
}
```

### Lifecycle

- Connect → session created
- Place holds → server confirms or rejects
- Disconnect → all session holds released

---

## WebSocket: Availability Stream

```
ws://{host}/availability-ws
```

### Client → Server

**Subscribe:**
```json
{
  "type": "stream.subscribe",
  "tenantId": "string",
  "resourceId": "string"
}
```

### Server → Client

**Hello (initial state):**
```json
{
  "type": "stream.hello",
  "slots": [...],
  "cursor": "string"
}
```

**Delta (change):**
```json
{
  "type": "stream.delta",
  "kind": "HoldPlaced | HoldReleased | HoldExpired | BookingConfirmed | BookingCancelled",
  "slotId": "string",
  "resourceId": "string",
  "start": 1234567890000,
  "end": 1234567890000
}
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| TAP_INVALID_INPUT | 400 | Malformed request |
| TAP_SLOT_UNAVAILABLE | 409 | Slot already held/booked |
| TAP_HOLD_NOT_FOUND | 404 | Hold does not exist |
| TAP_HOLD_EXPIRED | 410 | Hold has expired |
| TAP_BOOKING_NOT_FOUND | 404 | Booking does not exist |
| TAP_RESOURCE_NOT_FOUND | 404 | Resource does not exist |
| TAP_UNAUTHORIZED | 401 | Authentication required |
| TAP_INTERNAL_ERROR | 500 | Server error |

Error Response:

```json
{
  "error": {
    "code": "TAP_SLOT_UNAVAILABLE",
    "message": "Slot is already held"
  }
}
```

---

## Headers

| Header | Purpose |
|--------|---------|
| `Content-Type` | `application/json` |
| `Authorization` | Bearer token (optional) |
| `X-TAP-Version` | Protocol version |
| `X-Request-Id` | Request tracing |

---

## Idempotency

TAP provides **natural idempotency** without requiring separate idempotency stores.

### Idempotency Keys

| Operation | Key | Behavior |
|-----------|-----|----------|
| `POST /book` | `holdId` | Returns existing booking if hold was already converted |
| `POST /book` | `clientRef` | Returns existing booking if clientRef already used (tenant-scoped) |
| `POST /cancel` | `bookingId` | Canceling twice returns same result |
| `hold.place` | `clientRef` | Returns existing hold if clientRef already used (session-scoped) |

### Design Principles

1. **Natural Keys Over UUIDs**: Use business-meaningful keys (`holdId`, `clientRef`) rather than requiring clients to generate idempotency tokens
2. **Safe Retries**: All mutating operations can be safely retried on network errors
3. **Consistent Responses**: Idempotent retries return the same response as the original request
4. **No TTL Complexity**: Keys persist with the resource they created (hold or booking)

### clientRef

The `clientRef` field enables client-driven idempotency:

```json
{
  "tenantId": "...",
  "resourceId": "...",
  "slotId": "...",
  "clientRef": "checkout-abc123",
  "customer": { ... }
}
```

- MUST be unique within scope (tenant for bookings, session for holds)
- Clients SHOULD use deterministic values (e.g., `{userId}-{slotId}-{timestamp}`)
- Servers MUST return existing resource if `clientRef` matches

### Retry Behavior

Clients SHOULD retry on:
- Network timeouts
- 5xx responses
- Connection resets

Clients SHOULD NOT retry on:
- 4xx responses (except 408 Request Timeout, 429 Too Many Requests)
- Explicit error codes like `TAP_SLOT_UNAVAILABLE`

---

## CORS

Servers SHOULD allow:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Non-Goals

TAP Protocol does NOT define:
- Authentication mechanisms (use OAuth, API keys, etc.)
- Rate limiting policies
- Payment flows
- Resource discovery across servers (see TAP Federation)

---

*This specification defines HOW to communicate. See TAP Core for the data model.*

