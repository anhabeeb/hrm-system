import { Badge } from "@/components/ui/badge";

export const statusBadge = (active: number | boolean | null | undefined) => (
  <Badge variant={active === 1 || active === true ? "default" : "secondary"}>{active === 1 || active === true ? "Active" : "Inactive"}</Badge>
);

export const yesNo = (value: number | boolean | null | undefined) => value === 1 || value === true ? "Yes" : "No";
