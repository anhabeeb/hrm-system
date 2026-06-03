import { ok } from "../utils/response";

export class RealtimeRoom implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    if (request.method === "POST" && url.pathname === "/events") {
      const eventPayload = await request.json<unknown>().catch(() => null);

      return ok(
        {
          accepted: true,
          room_id: this.state.id.toString(),
          event: eventPayload,
        },
        "Realtime event placeholder accepted.",
      );
    }

    void this.env;

    return ok(
      {
        room_id: this.state.id.toString(),
      },
      "Realtime room placeholder is available.",
    );
  }

  private handleWebSocketUpgrade(): Response {
    const socketPair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(socketPair);

    serverSocket.accept();
    serverSocket.send(
      JSON.stringify({
        type: "placeholder",
        message:
          "Realtime WebSocket support will be expanded in a later prompt.",
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  }
}
