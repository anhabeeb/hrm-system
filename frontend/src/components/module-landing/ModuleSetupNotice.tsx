import type { ReactNode } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";

export const ModuleSetupNotice = ({ title, children }: { title: string; children?: ReactNode }) => (
  <InlineAlert variant="warning" title={title}>{children}</InlineAlert>
);
