import { useState } from "react";

import { Button } from "@/components/ui/button";

export const CopyDiagnosticsButton = ({ diagnostics }: { diagnostics: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? "Diagnostics copied" : "Copy diagnostics"}
    </Button>
  );
};
