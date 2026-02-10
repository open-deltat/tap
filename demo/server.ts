import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { dt } from "./lib/deltat";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

interface WsState {
  unlisten: (() => Promise<void>) | null;
  holdId: string | null;
  resourceId: string | null;
  start: number | null;
  end: number | null;
}

async function handleInit(ws: WebSocket, state: WsState, msg: any) {
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

async function handleConfirm(ws: WebSocket, state: WsState, msg: any) {
  if (!state.holdId || !state.resourceId || state.start == null || state.end == null) {
    ws.send(JSON.stringify({ type: "error", message: "No active hold to confirm" }));
    return;
  }

  try {
    const holdId = state.holdId;
    state.holdId = null;
    await dt.holds.release(holdId);

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
  handle(req, res, parse(req.url!, true));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = parse(req.url!);
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
      const msg = JSON.parse(String(raw));

      if (!initialized) {
        initialized = true;
        await handleInit(ws, state, msg);
        return;
      }

      if (msg.type === "confirm") {
        await handleConfirm(ws, state, msg);
        return;
      }
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
