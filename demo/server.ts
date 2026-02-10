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
}

async function handleInit(ws: WebSocket, state: WsState, msg: any) {
  state.unlisten = await dt.events.listen(msg.resourceId, (event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  if (msg.type === "hold") {
    const hold = await dt.holds.place({
      resourceId: msg.resourceId,
      start: msg.start,
      end: msg.end,
      expiresAt: Date.now() + 300_000,
    });
    state.holdId = hold.id;
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
  const state: WsState = { unlisten: null, holdId: null };
  let initialized = false;

  ws.on("message", async (raw) => {
    if (initialized) return;
    initialized = true;

    try {
      const msg = JSON.parse(String(raw));
      await handleInit(ws, state, msg);
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: String(err) }));
      ws.close();
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
