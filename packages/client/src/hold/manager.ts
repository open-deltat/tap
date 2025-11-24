import { HoldClient } from './client';

export type HoldManagerOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export type HoldManagerState = {
	sessionId: string | null;
};

export type HoldManagerCallbacks = {
	onStateChange?: (state: HoldManagerState) => void;
};

export class HoldManager {
	private client: HoldClient;
	private callbacks: HoldManagerCallbacks = {};
	private state: HoldManagerState = {
		sessionId: null,
	};

	constructor(private options: HoldManagerOptions) {
		this.client = new HoldClient(options);
	}

	setCallbacks(callbacks: HoldManagerCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): HoldManagerState {
		return { ...this.state };
	}

	private updateState(updates: Partial<HoldManagerState>): void {
		this.state = { ...this.state, ...updates };
		this.callbacks.onStateChange?.(this.state);
	}

	async placeHold(slotId: string): Promise<string> {
		const result = await this.client.placeHold(slotId);
		this.updateState({ sessionId: result.sessionId });
		return result.holdId;
	}

	releaseHold(holdId: string): void {
		this.client.releaseHold(holdId);
	}

	getSessionId(): string | null {
		return this.client.getSessionId();
	}

	disconnect(): void {
		this.client.disconnect();
		this.updateState({ sessionId: null });
	}
}
