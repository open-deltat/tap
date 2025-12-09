# @tap/client

Browser and Node.js SDK for consuming TAP (Time Allocation Protocol) APIs.

## Installation

```bash
npm install @tap/client
# or
bun add @tap/client
```

## Usage

```typescript
import { 
  AvailabilityClient,
  AvailabilityManager,
  HoldClient 
} from '@tap/client';

// Create availability client
const client = new AvailabilityClient({
  baseUrl: 'https://api.example.com',
});

// Fetch availability
const { slots } = await client.getAvailability({
  tenantId: 'tenant_123',
  resourceId: 'resource_456',
  from: Date.now(),
  to: Date.now() + 86400000,
});

// Use the manager for caching and real-time updates
const manager = new AvailabilityManager({
  baseUrl: 'https://api.example.com',
  tenantId: 'tenant_123',
  resourceId: 'resource_456',
});

await manager.connect();
manager.subscribe((slots) => {
  console.log('Availability updated:', slots);
});
```

## What's Included

- **AvailabilityClient**: HTTP client for availability queries
- **AvailabilityManager**: Manages caching and WebSocket subscriptions
- **HoldClient**: WebSocket client for placing and managing holds
- **Timezone Utilities**: Convert slots between timezones

## License

MIT

