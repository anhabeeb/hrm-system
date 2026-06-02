import { StatusBadge } from "@/components/data/StatusBadge";

export const WorkflowStepBadge = ({ step }: { step?: number | string }) => <StatusBadge status="neutral" label={`Step ${step ?? 1}`} />;
