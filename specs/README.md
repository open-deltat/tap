# TAP Specifications

Three specs. Completely separate.

| Spec | Defines | Concerns |
|------|---------|----------|
| [**CORE.md**](./CORE.md) | Data model | What exists |
| [**PROTOCOL.md**](./PROTOCOL.md) | HTTP/WS API | How to communicate |
| [**AUTH.md**](./AUTH.md) | Authentication | Who can do what |

---

## Core (The What)

Entities and rules:

```
Tenant
  └── Resource (tree via parentId)
        └── Offer (inherited, additive)
        └── Hold (temporary)
        └── Booking (permanent)
```

State machine:

```
OPEN ←→ HELD → BOOKED
```

---

## Protocol (The How)

Transport bindings:

```
HTTP:  /availability, /book, /cancel, /health
WS:    /hold-ws, /availability-ws
```

---

## Design Principles

1. **Separate concerns** — Core is abstract, Protocol is concrete
2. **Minimal surface** — Few entities, few endpoints
3. **Add-only offers** — No subtraction, no conflicts
4. **Events as truth** — Append-only, replayable
5. **Hierarchy is optional** — Single resource works, tree scales

---

## Future Specs

| Spec | Purpose | Status |
|------|---------|--------|
| FEDERATION.md | Cross-server discovery | Planned |
| SYNC.md | Offline-first reconciliation | Planned |

