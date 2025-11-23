import { z } from 'zod';
import {
	ErrorValueSchema,
	HoldIdSchema,
	ResourceIdSchema,
	SessionIdSchema,
	SlotIdSchema,
	TenantIdSchema,
} from './primitives';
import { HOLD_RELEASE_REASONS } from './values';

/**
 * WS /hold-ws connection semantics:
 *
 * 1. Client connects with query params (tenantId, resourceId, slotId).
 * 2. Connection itself implies a request to HOLD that slot.
 * 3. Server validates availability.
 *    - If available: Sends hold.session.hello AND hold.confirmed.
 *    - If unavailable: Sends hold.error (TAP_SLOT_UNAVAILABLE) and closes.
 * 4. Hold validity == Connection lifetime (unless forcefully released).
 */

export const HoldWsHelloSchema = z.object({
	type: z.literal('hold.session.hello'),
	sessionId: SessionIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
});
export type HoldWsHello = z.infer<typeof HoldWsHelloSchema>;

export const HoldWsConfirmedSchema = z.object({
	type: z.literal('hold.confirmed'),
	holdId: HoldIdSchema,
	tenantId: TenantIdSchema,
	resourceId: ResourceIdSchema,
	slotId: SlotIdSchema,
	startUnix: z.number(),
	endUnix: z.number(),
});
export type HoldWsConfirmed = z.infer<typeof HoldWsConfirmedSchema>;

export const HoldWsForceReleaseSchema = z.object({
	type: z.literal('hold.forceRelease'),
	holdId: HoldIdSchema,
	reason: z.enum(HOLD_RELEASE_REASONS),
});
export type HoldWsForceRelease = z.infer<typeof HoldWsForceReleaseSchema>;

export const HoldWsErrorSchema = z.object({
	type: z.literal('hold.error'),
	errorValue: ErrorValueSchema,
	message: z.string(),
});
export type HoldWsError = z.infer<typeof HoldWsErrorSchema>;

export const HoldWsServerMessageSchema = z.union([
	HoldWsHelloSchema,
	HoldWsConfirmedSchema,
	HoldWsForceReleaseSchema,
	HoldWsErrorSchema,
]);
export type HoldWsServerMessage = z.infer<typeof HoldWsServerMessageSchema>;

export const HoldWsClientMessageSchema = z.union([
	z.object({
		type: z.literal('hold.ping'),
		nonce: z.string().optional(),
	}),
	z.object({
		type: z.literal('hold.release'),
		holdId: HoldIdSchema,
	}),
]);
export type HoldWsClientMessage = z.infer<typeof HoldWsClientMessageSchema>;
