import { describe, it } from "vitest";

describe.todo("Application-wide error diagnostics UI", () => {
  it.todo("structured backend errors render title, message, technicalMessage, requestId, code, step, and suggestedAction");
  it.todo("validation fieldErrors render beside matching form fields and in the summary panel");
  it.todo("network failures render NETWORK_UNREACHABLE with a retryable diagnostic panel");
  it.todo("non-JSON API failures render INVALID_API_RESPONSE");
  it.todo("CopyDiagnosticsButton copies the compact diagnostic text");
  it.todo("React error boundary renders UI_RENDER_ERROR and a reload action");
  it.todo("setup page displays DATABASE_MISSING_TABLE with migration suggested action");
});
