import {
	AvailabilityWsClientMessageSchema,
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
} from '@tap/protocol';
import type { ServerWebSocket } from 'bun';

export type AvailabilityWSData = {
	type: 'availability';
};

export const availabilityWebSocketHandler = {
	open(ws: ServerWebSocket<AvailabilityWSData>) {
		const hello: AvailabilityWsServerMessage = {
			type: 'stream.hello',
			resourceId: null,
			tenantId: null,
			cursor: crypto.randomUUID(),
		};
		ws.send(JSON.stringify(hello));
	},

	message(ws: ServerWebSocket<AvailabilityWSData>, message: string | Buffer) {
		const str = typeof message === 'string' ? message : message.toString();
		let json: unknown;
		try {
			json = JSON.parse(str);
		} catch (_e) {
			return;
		}

		const result = AvailabilityWsClientMessageSchema.safeParse(json);
		if (result.success) {
			const msg = result.data;
			if (msg.type === 'stream.subscribe') {
				const topic = createAvailabilityTopic(msg.tenantId, msg.resourceId);
				ws.subscribe(topic);
			}
		}
	},

	close(_ws: ServerWebSocket<AvailabilityWSData>) {
		// Bun automatically unsubscribes on close
	},
};
