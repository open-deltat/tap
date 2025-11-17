import { createAllocator, createInMemoryEventStore } from '../src';
import { ulid } from 'ulid';
import type { TenantId, ResourceId, BookingId } from '../src/domain/ids';

const allocator = createAllocator();
const eventStore = createInMemoryEventStore();

const tenantId = ulid() as TenantId;
const resourceId = ulid() as ResourceId;

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/hold' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { day, startMinute, endMinute, expiresAtMs } = body;

        if (!day || typeof startMinute !== 'number' || typeof endMinute !== 'number') {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: day, startMinute, endMinute' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const expiresAt = expiresAtMs || Date.now() + 60_000;

        const result = await allocator.placeHold({
          tenantId,
          resourceId,
          day,
          startMinute,
          endMinute,
          expiresAt,
        });

        if (!result.success) {
          return new Response(
            JSON.stringify({ error: 'Slot not available' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }

        await eventStore.append(result.event);

        return new Response(
          JSON.stringify({
            holdId: result.holdId,
            event: result.event,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.pathname === '/confirm' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { holdId, bookingId, customerEmail, priceCents } = body;

        if (!holdId || !bookingId) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: holdId, bookingId' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const event = await allocator.confirmBooking({
          tenantId,
          resourceId,
          holdId: holdId as any,
          bookingId: bookingId as BookingId,
          customerEmail,
          priceCents,
        });

        if (!event) {
          return new Response(
            JSON.stringify({ error: 'Hold not found or expired' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }

        await eventStore.append(event);

        return new Response(
          JSON.stringify({ event }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.pathname === '/availability' && req.method === 'GET') {
      try {
        const day = url.searchParams.get('day');
        if (!day) {
          return new Response(
            JSON.stringify({ error: 'Missing query parameter: day' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const state = allocator.getState(tenantId, resourceId);
        const dayState = state.get(day);

        if (!dayState) {
          return new Response(
            JSON.stringify({ day, available: true, booked: [], held: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const booked: number[] = [];
        const held: number[] = [];

        for (let m = 0; m < 1440; m++) {
          const byte = m >> 3;
          const bit = m & 7;
          const bookedByte = dayState.booked[byte];
          const heldByte = dayState.held[byte];
          if (bookedByte !== undefined && (bookedByte & (1 << bit)) !== 0) {
            booked.push(m);
          }
          if (heldByte !== undefined && (heldByte & (1 << bit)) !== 0) {
            held.push(m);
          }
        }

        return new Response(
          JSON.stringify({
            day,
            available: booked.length === 0 && held.length === 0,
            booked,
            held,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.pathname === '/events' && req.method === 'GET') {
      try {
        const events = await eventStore.getAll();
        return new Response(
          JSON.stringify({ events }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (url.pathname === '/expire' && req.method === 'POST') {
      try {
        const expired = allocator.expireHolds(Date.now());
        return new Response(
          JSON.stringify({ expired: expired.length, holdIds: expired }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  },
});

console.log(`TAP E2E Server running at http://localhost:${server.port}`);
console.log(`\nEndpoints:`);
console.log(`  GET  /health       - Health check`);
console.log(`  POST /hold         - Place a hold (body: { day, startMinute, endMinute, expiresAtMs? })`);
console.log(`  POST /confirm      - Confirm a booking (body: { holdId, bookingId, customerEmail?, priceCents? })`);
console.log(`  GET  /availability - Get availability (query: ?day=YYYY-MM-DD)`);
console.log(`  GET  /events       - Get all events`);
console.log(`  POST /expire       - Expire holds`);

