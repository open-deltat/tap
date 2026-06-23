import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { dt } from "./lib/deltat";
import { trackBookings } from "./lib/session-bookings";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// Stream guard (server-authoritative — a browser timer can't be trusted). Each /ws stream is closed
// after STREAM_MAX_AGE_MS so nobody can squat a live connection; the client is warned
// STREAM_WARN_MS before so it can offer a one-tap "keep watching". Per-IP / total caps bound a
// flood. 0 disables a limit. (deltat has its own per-connection guard for direct-pgwire attackers;
// this is the per-browser-session control deltat can't do, since porsager multiplexes all browser
// sockets onto one deltat connection.)
const STREAM_MAX_AGE_MS = parseInt(process.env.STREAM_MAX_AGE_MS || "300000", 10); // 5 min
const STREAM_WARN_MS = parseInt(process.env.STREAM_WARN_MS || "60000", 10); // warn 60s before
const MAX_WS_PER_IP = parseInt(process.env.MAX_WS_PER_IP || "20", 10);
const MAX_WS_TOTAL = parseInt(process.env.MAX_WS_TOTAL || "800", 10);
const POLICY_CLOSE = 4002; // app-defined close code: "closed by server stream policy" (don't auto-reconnect)
// X-Forwarded-For is only trustworthy behind a proxy that overwrites it. The shipped compose
// publishes port 3000 directly, so default to OFF and key the per-IP cap on the real socket address
// — otherwise a single host forges a fresh XFF per upgrade and walks past MAX_WS_PER_IP.
const TRUST_PROXY = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";

const wsIp = new WeakMap<WebSocket, string>();
const perIp = new Map<string, number>();
let wsTotal = 0;

const app = next({ dev });
const handle = app.getRequestHandler();

// The WebSocket wire protocol, validated at the boundary so untrusted JSON never reaches deltat as
// an unchecked `any`. The first message opens a live subscription (and optionally a hold); later
// messages confirm it. deltat enforces the semantic limits on the values (span/timestamp ranges).
const InitMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), resourceId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("hold"),
    resourceId: z.string().min(1).max(64),
    start: z.number().int(),
    end: z.number().int(),
  }),
]);
const ConfirmMessage = z.object({ type: z.literal("confirm"), label: z.string().max(10_000).optional() });

type InitMessage = z.infer<typeof InitMessage>;
type ConfirmMessage = z.infer<typeof ConfirmMessage>;

interface WsState {
  unlisten: (() => Promise<void>) | null;
  holdId: string | null;
  resourceId: string | null;
  start: number | null;
  end: number | null;
}

async function handleInit(ws: WebSocket, state: WsState, msg: InitMessage) {
  state.resourceId = msg.resourceId;

  state.unlisten = await dt.events.listen(msg.resourceId, (event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  if (msg.type === "hold") {
    state.start = msg.start;
    state.end = msg.end;
    const hold = await dt.holds.place({
      resourceId: msg.resourceId,
      start: msg.start,
      end: msg.end,
      expiresAt: Date.now() + 300_000,
    });
    state.holdId = hold.id;
  }
}

async function handleConfirm(ws: WebSocket, state: WsState, msg: ConfirmMessage) {
  if (!state.holdId || !state.resourceId || state.start == null || state.end == null) {
    ws.send(JSON.stringify({ type: "error", message: "No active hold to confirm" }));
    return;
  }

  try {
    const holdId = state.holdId;
    state.holdId = null;

    // Release the hold BEFORE booking: deltat treats an active hold as a conflict, so
    // booking the same span while the hold is still live rejects the booking against the
    // client's own hold (same root cause as the seat-batch path).
    try { await dt.holds.release(holdId); } catch {}

    const [booking] = await dt.bookings.create([{
      resourceId: state.resourceId,
      start: state.start,
      end: state.end,
      label: msg.label || undefined,
    }]);

    // Self-clean like every other demo booking: the WS path has no visitor cookie, so register it
    // under a shared "ws" key and let the module reaper cancel it after the short TTL.
    trackBookings("ws", [booking], Date.now());

    ws.send(JSON.stringify({ type: "confirmed", booking }));
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: String(err) }));
  }
}

async function handleClose(state: WsState) {
  if (state.holdId) {
    try { await dt.holds.release(state.holdId); } catch {}
    state.holdId = null;
  }
  if (state.unlisten) {
    try { await state.unlisten(); } catch {}
    state.unlisten = null;
  }
}

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url ?? "/", true));
});

const wss = new WebSocketServer({ noServer: true });

function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  if (TRUST_PROXY) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url ?? "/");
  if (pathname !== "/ws") return;
  const ip = clientIp(req);
  if ((MAX_WS_TOTAL > 0 && wsTotal >= MAX_WS_TOTAL) || (MAX_WS_PER_IP > 0 && (perIp.get(ip) ?? 0) >= MAX_WS_PER_IP)) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wsIp.set(ws, ip);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    wsTotal += 1;
    wss.emit("connection", ws);
  });
});

wss.on("connection", (ws) => {
  const state: WsState = { unlisten: null, holdId: null, resourceId: null, start: null, end: null };
  let initialized = false;
  let initStarted = false;

  ws.on("message", async (raw) => {
    try {
      const json: unknown = JSON.parse(String(raw));

      if (!initialized) {
        // One init per socket. initStarted gates re-entry while the awaited init is in flight, so a
        // second frame can't open a second subscription/hold; initialized flips only after init
        // succeeds, so a failed init still hits the `if (!initialized) ws.close()` path below.
        if (initStarted) return;
        initStarted = true;
        await handleInit(ws, state, InitMessage.parse(json));
        initialized = true;
        return;
      }

      await handleConfirm(ws, state, ConfirmMessage.parse(json));
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: String(err) }));
      if (!initialized) ws.close();
    }
  });

  // Server-authoritative stream lifetime: warn, then close by policy. The client is told via a
  // `__expiring` frame so it can offer "keep watching" (a fresh subscribe), and on close it gets the
  // POLICY_CLOSE code so it pauses instead of reconnect-storming.
  const warnTimer =
    STREAM_MAX_AGE_MS > 0
      ? setTimeout(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "__expiring", seconds: Math.round(STREAM_WARN_MS / 1000) }));
          }
        }, Math.max(0, STREAM_MAX_AGE_MS - STREAM_WARN_MS))
      : null;
  const closeTimer =
    STREAM_MAX_AGE_MS > 0
      ? setTimeout(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "__closing" }));
            ws.close(POLICY_CLOSE, "stream age limit");
          }
        }, STREAM_MAX_AGE_MS)
      : null;

  const ping = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
    else clearInterval(ping);
  }, 30_000);

  ws.on("close", () => {
    handleClose(state);
    clearInterval(ping);
    if (warnTimer) clearTimeout(warnTimer);
    if (closeTimer) clearTimeout(closeTimer);
    const ip = wsIp.get(ws);
    if (ip) {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      wsTotal = Math.max(0, wsTotal - 1);
    }
  });
});

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`);
});
