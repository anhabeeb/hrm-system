import apiApp from "./app";

export { RealtimeRoom } from "./durable-objects/realtime-room";

const frontendAssetsNotConfigured = () =>
  new Response("Frontend assets are not configured. Build frontend/dist and deploy with the ASSETS binding.", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return apiApp.fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return frontendAssetsNotConfigured();
  },
};

export default worker;
