export const RequestIdNote = ({ requestId }: { requestId?: string }) => {
  if (!requestId) return null;
  return <p className="text-xs text-muted-foreground">Request ID: {requestId}</p>;
};
