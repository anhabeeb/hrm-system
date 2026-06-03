export interface NotificationInput {
  recipientId: string;
  title: string;
  message: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export const createNotification = async (
  env: Env,
  input: NotificationInput,
) => {
  void env;

  console.info("Notification placeholder", input);

  return {
    queued: false,
    message:
      "Notification placeholder recorded for future delivery workflows.",
  };
};
