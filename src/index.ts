import apiApp from "./app";

export { RealtimeRoom } from "./durable-objects/realtime-room";

const frontendSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const withFrontendSecurityHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(frontendSecurityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const frontendAssetsNotConfigured = () =>
  withFrontendSecurityHeaders(
    new Response("Frontend assets are not configured. Build frontend/dist and deploy with the ASSETS binding.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    }),
  );

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return apiApp.fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return withFrontendSecurityHeaders(await env.ASSETS.fetch(request));
    }

    return frontendAssetsNotConfigured();
  },
};

export default worker;
