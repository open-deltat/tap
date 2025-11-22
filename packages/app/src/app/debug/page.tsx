'use client';

import type { LedgerEvent } from '@tap/core';
import {
	type AvailabilityPostResponse,
	type BookPostResponse,
	createSlotId,
	type HoldWsServerMessage,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import { AvailabilityStore } from '@tap/ws-client';
import { useRef, useState } from 'react';

const API_BASE =
	process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

const TENANT_ID = '01AN4Z07BY79KA1307SR9X4MV3' as TenantId;
const RESOURCE_ID = '01AN4Z07BY79KA1307SR9X4MV4' as ResourceId;

export default function DebugPage() {
	const [logs, setLogs] = useState<string[]>([]);
	const [availability, setAvailability] =
		useState<AvailabilityPostResponse | null>(null);
	const [holdInfo, setHoldInfo] = useState<{
		holdId: string;
		sessionId: string;
		slotId: string;
	} | null>(null);

	const availWsRef = useRef<WebSocket | null>(null);
	const holdWsRef = useRef<WebSocket | null>(null);
	const storeRef = useRef(new AvailabilityStore());

	const addLog = (msg: string) => {
		setLogs((prev) => [`[${new Date().toISOString()}] ${msg}`, ...prev]);
	};

	const checkAvailability = async () => {
		try {
			addLog('Checking availability...');
			const res = await fetch(`${API_BASE}/availability`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId: TENANT_ID,
					resourceId: RESOURCE_ID,
					from: '2025-01-01T00:00:00.000Z',
					to: '2025-01-02T00:00:00.000Z',
					slotDurationMinutes: 60,
				}),
			});
			const data = (await res.json()) as AvailabilityPostResponse;
			setAvailability(data);

			// Initialize store with these slots
			const slots = data.freeSlots.map((s) => ({
				start: new Date(s.start).getTime(),
				end: new Date(s.end).getTime(),
			}));
			storeRef.current.setSnapshot(slots, data.asOfEventId);

			addLog(`Availability received: ${data.freeSlots.length} slots found.`);
		} catch (e) {
			addLog(`Error checking availability: ${e}`);
		}
	};

	const connectAvailStream = () => {
		if (availWsRef.current) {
			addLog('Availability stream already connected.');
			return;
		}
		addLog(`Connecting to ${WS_BASE}/availability-ws...`);
		const ws = new WebSocket(`${WS_BASE}/availability-ws`);
		availWsRef.current = ws;

		ws.onopen = () => {
			addLog('Availability WS connected. Subscribing...');
			ws.send(
				JSON.stringify({
					type: 'stream.subscribe',
					tenantId: TENANT_ID,
					resourceId: RESOURCE_ID,
				}),
			);
		};

		ws.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			addLog(`[AvailStream] Received: ${JSON.stringify(msg)}`);

			if (msg.type === 'stream.delta') {
				const delta = msg.payload;

				// Construct partial event then cast
				const coreEventBase = {
					eventId: msg.eventId,
					type: delta.kind,
					tenantId: delta.tenantId,
					resourceId: delta.resourceId,
					createdAt: Date.now(),
					version: 1,
					payload: {},
				};

				let coreEvent: LedgerEvent;

				if (
					delta.kind === 'HoldPlaced' ||
					delta.kind === 'HoldReleased' ||
					delta.kind === 'HoldExpired'
				) {
					const start = new Date(delta.start);
					const end = new Date(delta.end);
					const day = start.toISOString().split('T')[0];
					const startMinute = start.getUTCHours() * 60 + start.getUTCMinutes();
					const endMinute = end.getUTCHours() * 60 + end.getUTCMinutes();

					coreEvent = {
						...coreEventBase,
						type: delta.kind,
						payload: {
							holdId: delta.holdId,
							day,
							startMinute,
							endMinute,
							expiresAt: 0, // Not needed for merge
						},
					} as unknown as LedgerEvent;
				} else if (
					delta.kind === 'BookingConfirmed' ||
					delta.kind === 'BookingCancelled'
				) {
					coreEvent = {
						...coreEventBase,
						type: delta.kind,
						payload: {
							bookingId: delta.bookingId,
							start: new Date(delta.start).getTime(),
							end: new Date(delta.end).getTime(),
							holdId: delta.holdId,
						},
					} as unknown as LedgerEvent;
				} else {
					return;
				}

				storeRef.current.applyEvent(coreEvent);

				const snapshot = storeRef.current.getSnapshot();

				setAvailability((prev) => {
					if (!prev) return null;
					const newFreeSlots = snapshot.slots.map((s) => ({
						slotId: createSlotId(new Date(s.start), new Date(s.end)),
						resourceId: prev.resourceId,
						tenantId: prev.tenantId,
						start: new Date(s.start).toISOString(),
						end: new Date(s.end).toISOString(),
					}));

					return {
						...prev,
						asOfEventId: snapshot.cursor ?? prev.asOfEventId,
						freeSlots: newFreeSlots,
					};
				});
			}
		};

		ws.onclose = () => {
			addLog('Availability WS disconnected.');
			availWsRef.current = null;
		};
	};

	const placeHold = () => {
		if (!availability || availability.freeSlots.length === 0) {
			addLog('No available slots to hold. Check availability first.');
			return;
		}
		if (holdWsRef.current) {
			addLog('Hold WS already connected (active hold). Release first.');
			return;
		}

		const slot = availability.freeSlots[0];
		addLog(`Attempting to hold slot: ${slot.slotId}...`);

		const url = `${WS_BASE}/hold-ws?tenantId=${TENANT_ID}&resourceId=${RESOURCE_ID}&slotId=${slot.slotId}`;
		const ws = new WebSocket(url);
		holdWsRef.current = ws;

		ws.onopen = () => {
			addLog('Hold WS connected.');
		};

		ws.onmessage = (event) => {
			const msg = JSON.parse(event.data) as HoldWsServerMessage;
			addLog(`[HoldWS] Received: ${JSON.stringify(msg)}`);

			if (msg.type === 'hold.session.hello') {
				setHoldInfo((prev) => ({
					holdId: prev?.holdId ?? '',
					sessionId: msg.sessionId,
					slotId: slot.slotId,
				}));
			}
			if (msg.type === 'hold.confirmed') {
				setHoldInfo((prev) => ({
					holdId: msg.holdId,
					sessionId: prev?.sessionId ?? '',
					slotId: prev?.slotId ?? '',
				}));
			}
			if (msg.type === 'hold.error') {
				addLog(`Hold Error: ${msg.errorValue} - ${msg.message}`);
				ws.close();
			}
		};

		ws.onclose = () => {
			addLog('Hold WS disconnected.');
			holdWsRef.current = null;
			setHoldInfo(null);
		};
	};

	const releaseHold = () => {
		if (holdWsRef.current) {
			if (holdInfo?.holdId) {
				holdWsRef.current.send(
					JSON.stringify({
						type: 'hold.release',
						holdId: holdInfo.holdId,
					}),
				);
				addLog('Sent hold release request.');
			} else {
				holdWsRef.current.close();
				addLog('Closed Hold WS connection.');
			}
		} else {
			addLog('No active hold connection.');
		}
	};

	const bookSlot = async () => {
		if (!holdInfo || !holdInfo.holdId || !holdInfo.sessionId) {
			addLog('No active hold to book. Place a hold first.');
			return;
		}

		try {
			addLog(`Booking slot ${holdInfo.slotId} with hold ${holdInfo.holdId}...`);
			const res = await fetch(`${API_BASE}/book`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tenantId: TENANT_ID,
					resourceId: RESOURCE_ID,
					slotId: holdInfo.slotId,
					holdId: holdInfo.holdId,
					holdSessionId: holdInfo.sessionId,
					customer: {
						name: 'Debug User',
						email: 'debug@example.com',
					},
				}),
			});
			const data = await res.json();
			if (res.ok) {
				addLog(
					`Booking Confirmed! ID: ${(data as BookPostResponse).bookingId}`,
				);
				if (holdWsRef.current) {
					holdWsRef.current.close();
				}
			} else {
				addLog(`Booking Failed: ${JSON.stringify(data)}`);
			}
		} catch (e) {
			addLog(`Error booking: ${e}`);
		}
	};

	return (
		<div className="p-8 container mx-auto">
			<h1 className="text-2xl font-bold mb-6">TAP API Debugger</h1>

			<div className="flex gap-4 mb-8 flex-wrap">
				<button
					type="button"
					onClick={checkAvailability}
					className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
				>
					1. Check Availability
				</button>
				<button
					type="button"
					onClick={connectAvailStream}
					className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
				>
					2. Connect Stream
				</button>
				<button
					type="button"
					onClick={placeHold}
					disabled={!availability}
					className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-50"
				>
					3. Place Hold (First Slot)
				</button>
				<button
					type="button"
					onClick={bookSlot}
					disabled={!holdInfo}
					className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
				>
					4. Book Held Slot
				</button>
				<button
					type="button"
					onClick={releaseHold}
					disabled={!holdInfo}
					className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
				>
					Release Hold
				</button>
			</div>

			<div className="grid grid-cols-2 gap-8">
				<div className="border p-4 rounded bg-gray-50 h-[500px] overflow-y-auto font-mono text-sm">
					<h2 className="font-bold mb-2 sticky top-0 bg-gray-50">Logs</h2>
					{logs.map((log) => (
						<div key={log} className="mb-1 border-b border-gray-200 pb-1">
							{log}
						</div>
					))}
				</div>
				<div className="border p-4 rounded bg-gray-50 h-[500px] overflow-y-auto font-mono text-sm">
					<h2 className="font-bold mb-2 sticky top-0 bg-gray-50">State</h2>
					<div className="mb-4">
						<strong>Active Hold:</strong>
						<pre>{JSON.stringify(holdInfo, null, 2)}</pre>
					</div>
					<h3 className="font-bold mt-4">Availability Response:</h3>
					<pre>{JSON.stringify(availability, null, 2)}</pre>
				</div>
			</div>
		</div>
	);
}
