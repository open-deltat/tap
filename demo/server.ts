import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { dt } from "./lib/deltat";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

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
    await state.unlisten();
    state.unlisten = null;
  }
}

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url ?? "/", true));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url ?? "/");
  if (pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws);
    });
  }
});

wss.on("connection", (ws) => {
  const state: WsState = { unlisten: null, holdId: null, resourceId: null, start: null, end: null };
  let initialized = false;

  ws.on("message", async (raw) => {
    try {
      const json: unknown = JSON.parse(String(raw));

      if (!initialized) {
        initialized = true;
        await handleInit(ws, state, InitMessage.parse(json));
        return;
      }

      await handleConfirm(ws, state, ConfirmMessage.parse(json));
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: String(err) }));
      if (!initialized) ws.close();
    }
  });

  ws.on("close", () => handleClose(state));

  const ping = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
    else clearInterval(ping);
  }, 30_000);

  ws.on("close", () => clearInterval(ping));
});

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`);
});
