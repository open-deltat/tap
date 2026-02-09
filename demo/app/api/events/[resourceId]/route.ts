import { dt } from "@/lib/deltat";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string }> }
): Promise<Response> {
  const { resourceId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Send initial heartbeat
      send(JSON.stringify({ type: "connected" }));

      const unlisten = await dt.events.listen(resourceId, (event) => {
        try {
          send(JSON.stringify(event));
        } catch {
          // Stream may be closed
        }
      });

      // Keep-alive every 30s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30_000);

      // Clean up when client disconnects
      _request.signal.addEventListener("abort", async () => {
        clearInterval(keepAlive);
        await unlisten();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
