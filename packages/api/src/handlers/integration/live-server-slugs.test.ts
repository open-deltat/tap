import { expect, test, beforeAll, afterAll, describe } from 'bun:test';
import { spawn } from 'bun';
import { ulid } from 'ulid';
import { createTestTenant, createTestResource } from '../test-setup';
import type { Tenant, Resource } from '@tap/core';
import path from 'path';

let API_PORT: number;
let API_URL: string;
let WS_URL: string;

let serverProcess: any;
let testTenant: Tenant;
let testResource: Resource;

beforeAll(async () => {
    // 1. Create Data
    testTenant = await createTestTenant();
    testResource = await createTestResource(testTenant);

    // 2. Resolve API Directory
    const apiDir = path.resolve(import.meta.dir, '../../..');

    // 3. Spawn Server on random port (0)
    await new Promise<void>((resolve, reject) => {
        serverProcess = spawn({
            cmd: ['bun', path.join(apiDir, 'src/index.ts')], // Use absolute path
            env: { ...process.env, PORT: '0' },
            cwd: apiDir,
            stdout: 'pipe',
            stderr: 'inherit',
        });

        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for server to start'));
        }, 10000);

        async function readStream(stream: ReadableStream) {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let foundPort = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                buffer += chunk;
                console.log(chunk); // Pipe to test output

                // Look for port
                const match = buffer.match(/TAP API running at http:\/\/localhost:(\d+)/);
                if (match && !foundPort) {
                    foundPort = true;
                    API_PORT = parseInt(match[1], 10);
                    API_URL = `http://127.0.0.1:${API_PORT}`;
                    WS_URL = `ws://127.0.0.1:${API_PORT}`;
                    console.log(`[Granular Test] Discovered port: ${API_PORT}`);

                    // Verify connectivity before resolving
                    for (let i = 0; i < 10; i++) {
                        try {
                            const res = await fetch(`${API_URL}/health`);
                            if (res.ok) {
                                console.log('[Granular Test] Server verified UP via HTTP');
                                clearTimeout(timeout);
                                resolve();
                                return; // Keep reading stdout but we are done
                            }
                        } catch (e) {}
                        await new Promise(r => setTimeout(r, 100));
                    }
                    reject(new Error('Server started but unreachable via HTTP'));
                }
            }
        }

        if (serverProcess.stdout) {
            readStream(serverProcess.stdout).catch(e => console.error('Stream error', e));
        } else {
            reject(new Error('No stdout'));
        }
    });
});

afterAll(() => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

describe('Live Server Granular Diagnosis', () => {

    test('1. Server returns Health Check', async () => {
        try {
            const res = await fetch(`${API_URL}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('ok');
        } catch (e) {
            console.error('Health Check Failed:', e);
            throw e;
        }
    });

    test('2. Public Availability API resolves slugs (HTTP)', async () => {
        const from = new Date().toISOString();
        const to = new Date(Date.now() + 86400000).toISOString();
        const url = `${API_URL}/v1/public/${testTenant.slug}/${testResource.slug}/availability?from=${from}&to=${to}`;

        const res = await fetch(url);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.resourceId).toBe(testResource.id);
    });

    test('3. WS Connects with UUIDs', async () => {
        const wsUrl = `${WS_URL}/v1/hold-stream?tenantId=${testTenant.id}&resourceId=${testResource.id}`;

        const ws = new WebSocket(wsUrl);
        await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = (e) => reject(new Error(`WS Error: ${JSON.stringify(e)}`));
            setTimeout(() => reject(new Error('WS Timeout')), 2000);
        });
        ws.close();
    });

    test('4. WS Connects with Slugs', async () => {
        const wsUrl = `${WS_URL}/v1/hold-stream?tenantSlug=${testTenant.slug}&resourceSlug=${testResource.slug}`;

        const ws = new WebSocket(wsUrl);
        await new Promise<void>((resolve, reject) => {
            ws.onopen = () => resolve();
            ws.onerror = (e) => reject(new Error(`WS Error: ${JSON.stringify(e)}`));
            setTimeout(() => reject(new Error('WS Timeout')), 2000);
        });
        ws.close();
    });

    test('5. Place Hold via WS', async () => {
        const wsUrl = `${WS_URL}/v1/hold-stream?tenantSlug=${testTenant.slug}&resourceSlug=${testResource.slug}`;
        const ws = new WebSocket(wsUrl);

        const messages: any[] = [];
        ws.onmessage = (e) => messages.push(JSON.parse(e.data));

        await new Promise<void>((resolve) => ws.onopen = () => resolve());

        const reqId = ulid();
        ws.send(JSON.stringify({
            type: 'hold.request',
            requestId: reqId,
            day: '2025-01-01',
            startMinute: 600,
            endMinute: 660
        }));

        let confirmed = false;
        for (let i = 0; i < 20; i++) {
            if (messages.find(m => m.type === 'hold.confirmed' && m.requestId === reqId)) {
                confirmed = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        expect(confirmed).toBe(true);
        ws.close();
    });
});
