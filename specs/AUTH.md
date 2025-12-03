# TAP Authentication Specification

**Version:** 0.1.0
**Status:** Draft

TAP Auth defines how clients authenticate to TAP servers.

---

## Principles

1. **TAP is not an identity provider** - delegates to platforms/payments
2. **End users don't auth to TAP** - they auth to platforms
3. **Reads are public by default** - availability is discoverable
4. **Writes require proof** - holds need sessions, bookings need payment/tokens

---

## Auth Contexts

### 1. Anonymous

No authentication. Used for:
- Reading public availability
- Health checks
- Discovery endpoints

```
GET /availability
→ No headers required
→ Rate limited by IP
```

### 2. Session

Ephemeral identity for holds. No account needed.

```
POST /session
→ Returns { sessionId: "sess_xxx", expiresAt: 123456 }

WS /hold-ws?sessionId=sess_xxx
→ Session tracks holds, auto-releases on disconnect
```

### 3. API Key

Tenant-issued keys for integrations.

```
Authorization: TAP-Key {tenant_id}:{secret}
```

Scopes:
- `read` - Query availability
- `hold` - Place holds
- `book` - Confirm bookings
- `manage` - CRUD resources/offers

### 4. Server-to-Server

Signed requests between TAP servers.

```
X-TAP-Server-Id: airbnb_tap_prod
X-TAP-Timestamp: 2025-01-01T00:00:00.000Z
X-TAP-Signature: {signature}
```

Signature: `ed25519(privateKey, method + path + timestamp + bodyHash)`

### 5. Payment Proof

Booking confirmed by payment reference.

```json
{
  "slotId": "...",
  "paymentRef": "stripe_pi_xxx",
  "paymentProvider": "stripe"
}
```

Server verifies payment before confirming.

---

## Access Policies

Resources define access per operation:

```
accessPolicy: {
  availability: "public" | "session" | "authenticated",
  hold: "session" | "authenticated",
  book: "payment" | "authenticated",
  cancel: "booking_owner" | "authenticated",
  manage: "owner"
}
```

Defaults:
- `availability`: public
- `hold`: session
- `book`: payment
- `cancel`: booking_owner
- `manage`: owner

---

## Endpoints

### Create Session

```
POST /session

Response:
{
  "sessionId": "sess_01HXYZ...",
  "expiresAt": 1234567890000
}
```

No auth required. Rate limited.

### Validate API Key

Keys are validated on each request:

```
Authorization: TAP-Key tenant_123:sk_live_abc123
```

Format: `{tenantId}:{secret}`

---

## Server Discovery

Servers publish their identity:

```
GET /.well-known/timebook.json

{
  "tap_version": "0.1.0",
  "server_id": "my_tap_server",
  "public_key": "ed25519:base64...",
  "endpoints": { ... }
}
```

---

## Trust Model

```
Tenant (resource owner)
├── Issues API Keys → Platforms
│   └── Platforms act on behalf of end users
├── Trusts Servers → Peer TAP servers
│   └── Verified by public key
└── Accepts Payments → End users
    └── Payment proves intent
```

---

## Security Considerations

- API keys must be kept secret (server-side only)
- Session tokens are short-lived (default: 1 hour)
- Server signatures prevent replay (timestamp window: 5 minutes)
- Rate limiting prevents abuse of public endpoints

---

*See TAP Protocol for endpoint details.*

