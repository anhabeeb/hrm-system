import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const DocumentDownloadButton = ({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) => (
  <Button variant="outline" type="button" disabled={disabled} onClick={onClick}>
    <Download className="h-4 w-4" /> Download
  </Button>
);
