import type { ReactNode } from "react";

export const PageHeader = ({ title, description: _description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => {
  void _description;

  if (!actions) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 md:px-6" aria-label={`${title} page actions`}>
      {actions}
    </div>
  );
};
