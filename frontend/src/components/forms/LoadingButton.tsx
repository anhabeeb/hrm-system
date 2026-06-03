import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export const LoadingButton = ({
  loading,
  loadingText = "Working...",
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean; loadingText?: string }) => (
  <Button disabled={disabled || loading} {...props}>
    {loading ? loadingText : children}
  </Button>
);
