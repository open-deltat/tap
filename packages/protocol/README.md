# @tap/protocol

Zod schemas, TypeScript types, and constants for the TAP (Time Allocation Protocol).

## Installation

```bash
npm install @tap/protocol zod
# or
bun add @tap/protocol zod
```

## Usage

```typescript
import { 
  AvailabilityPostRequestBodySchema,
  BookPostRequestBodySchema,
  type TenantId,
  type ResourceId,
  type SlotId,
  API_ROUTES 
} from '@tap/protocol';

// Validate request bodies
const result = AvailabilityPostRequestBodySchema.safeParse(requestBody);

// Use branded types for type safety
const tenantId: TenantId = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;

// Access API route constants
console.log(API_ROUTES.AVAILABILITY); // '/availability'
```

## What's Included

- **Schemas**: Zod schemas for all TAP HTTP and WebSocket messages
- **Types**: TypeScript types inferred from schemas
- **Constants**: API routes, error codes
- **Branded Types**: `TenantId`, `ResourceId`, `SlotId`, `HoldId`, `BookingId`

## OpenAPI

```typescript
import { openApiDocument } from '@tap/protocol/openapi';
```

## License

MIT

