import type { ReactNode } from "react";

import { PageActionBar } from "./PageActionBar";

// Backward-compatible wrapper only. New pages should use PageActionBar directly;
// this component intentionally does not render page titles or descriptions.
export const PageHeader = ({ title, description: _description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => {
  void _description;

  if (!actions) return null;

  return (
    <PageActionBar label={`${title} page actions`}>
      {actions}
    </PageActionBar>
  );
};
