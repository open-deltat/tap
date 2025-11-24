import type { Server } from 'bun';
import type { WSData } from './index';

// Mutable container for the server instance
export const serverContext: { server: Server<WSData> | null } = {
	server: null,
};

export const setServer = (server: Server<WSData>) => {
	serverContext.server = server;
};
