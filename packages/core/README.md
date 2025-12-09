# @tap/core

Business logic for the TAP (Time Allocation Protocol) - availability calculation, hold management, and booking workflows.

## Installation

```bash
npm install @tap/core @tap/protocol zod
# or
bun add @tap/core @tap/protocol zod
```

## Usage

```typescript
import { 
  calculateAvailability,
  createHoldManager,
  createBookingManager,
  TapError
} from '@tap/core';

// Calculate availability from offers, holds, and bookings
const slots = calculateAvailability({
  offers,
  holds,
  bookings,
  from: Date.now(),
  to: Date.now() + 86400000, // 24 hours
  slotMinutes: 60,
  timezone: 'America/New_York'
});

// Handle errors
try {
  // ... operations
} catch (error) {
  if (error instanceof TapError) {
    console.log(error.code); // 'TAP_SLOT_UNAVAILABLE'
  }
}
```

## What's Included

- **Availability Calculator**: Computes open slots from offers minus holds/bookings
- **Hold Manager**: Place, release, and expire holds with concurrency control
- **Booking Manager**: Confirm and cancel bookings
- **Interval Utilities**: Merge, subtract, and expand time intervals
- **Error Types**: Typed TAP errors with HTTP status codes

## License

MIT

