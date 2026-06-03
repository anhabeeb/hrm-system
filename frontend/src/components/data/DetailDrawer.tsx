import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const DetailDrawer = ({
  open,
  onOpenChange,
  title,
  subtitle,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        {subtitle || description ? <SheetDescription>{subtitle ?? description}</SheetDescription> : null}
      </SheetHeader>
      <div className="mt-5 space-y-4 pb-20">{children}</div>
      {footer ? <div className="sticky bottom-0 -mx-5 border-t bg-background p-4">{footer}</div> : null}
    </SheetContent>
  </Sheet>
);
