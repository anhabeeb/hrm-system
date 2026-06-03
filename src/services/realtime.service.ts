export interface BroadcastEventInput<TPayload = unknown> {
  roomName: string;
  type: string;
  payload: TPayload;
  triggeredBy?: string;
}

export const broadcastEvent = async <TPayload>(
  env: Env,
  input: BroadcastEventInput<TPayload>,
) => {
  // Placeholder bridge to the durable object until richer event routing is added.
  const roomId = env.REALTIME_ROOM.idFromName(input.roomName);
  const roomStub = env.REALTIME_ROOM.get(roomId);

  const response = await roomStub.fetch("https://realtime.internal/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(sanitizeSensitivePayload(input)),
  });

  return {
    delivered: response.ok,
    roomName: input.roomName,
    status: response.status,
  };
};
import { sanitizeSensitivePayload } from "../utils/sanitize";
