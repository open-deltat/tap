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
      "available": true,
      "capacity": 1,
      "remaining": 1
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

- `POST /book` with same `holdId` is idempotent
- `POST /cancel` with same `bookingId` is idempotent
- Clients SHOULD retry on network errors

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

