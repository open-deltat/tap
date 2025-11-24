import { BookingClient } from './client';

export type BookingManagerOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	onSuccess?: (bookingId: string) => void;
	onError?: (error: Error) => void;
};

export type BookingManagerState = {
	isConfirming: boolean;
	error: Error | null;
};

export type BookingManagerCallbacks = {
	onStateChange?: (state: BookingManagerState) => void;
};

export class BookingManager {
	private client: BookingClient;
	private callbacks: BookingManagerCallbacks = {};
	private state: BookingManagerState = {
		isConfirming: false,
		error: null,
	};
	private options: BookingManagerOptions;

	constructor(options: BookingManagerOptions) {
		this.options = options;
		this.client = new BookingClient({
			apiBaseUrl: options.apiBaseUrl,
			tenantSlug: options.tenantSlug,
			resourceSlug: options.resourceSlug,
		});
	}

	setCallbacks(callbacks: BookingManagerCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): BookingManagerState {
		return { ...this.state };
	}

	private updateState(updates: Partial<BookingManagerState>): void {
		this.state = { ...this.state, ...updates };
		this.callbacks.onStateChange?.(this.state);
	}

	async confirmBooking(params: {
		slotId: string;
		holdId: string;
		sessionId: string;
		customerName: string;
		customerEmail: string;
		customerPhone?: string;
	}): Promise<string | null> {
		this.updateState({ isConfirming: true, error: null });

		try {
			const bookingId = await this.client.confirmBooking(params);
			this.options.onSuccess?.(bookingId);
			this.updateState({ isConfirming: false });
			return bookingId;
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error');
			this.updateState({ error, isConfirming: false });
			this.options.onError?.(error);
			return null;
		}
	}
}
