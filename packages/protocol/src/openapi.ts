import {
	extendZodWithOpenApi,
	OpenAPIRegistry,
	OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { httpRoutes } from './schemas/http';
import * as wsAvailability from './schemas/ws-availability';
import * as wsHold from './schemas/ws-hold';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

for (const [path, route] of Object.entries(httpRoutes)) {
	registry.registerPath({
		method: route.method,
		path,
		summary: route.summary,
		description: route.description,
		tags: [route.tag],
		request: {
			body: { content: { 'application/json': { schema: route.request } } },
		},
		responses: {
			200: {
				description: 'Success',
				content: { 'application/json': { schema: route.response } },
			},
		},
	});
}

registry.register(
	'AvailabilityWsClientMessage',
	wsAvailability.AvailabilityWsClientMessageSchema,
);
registry.register(
	'AvailabilityWsServerMessage',
	wsAvailability.AvailabilityWsServerMessageSchema,
);
registry.register('HoldWsClientMessage', wsHold.HoldWsClientMessageSchema);
registry.register('HoldWsServerMessage', wsHold.HoldWsServerMessageSchema);

const tags = [...new Set(Object.values(httpRoutes).map((r) => r.tag))];

export const openApiDocument = new OpenApiGeneratorV3(
	registry.definitions,
).generateDocument({
	openapi: '3.0.3',
	info: {
		title: 'TAP Protocol',
		version: '0.1.0',
		description:
			'Time Allocation Protocol - Federated real-time booking synchronization',
		license: { name: 'MIT' },
	},
	servers: [{ url: 'http://localhost:3000', description: 'Local' }],
	tags: [
		...tags.map((t) => ({ name: t })),
		{ name: 'WebSocket', description: 'Real-time streaming' },
	],
});
