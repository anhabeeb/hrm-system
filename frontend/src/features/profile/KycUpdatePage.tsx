import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/format";

import { KycUpdateForm } from "./KycUpdateForm";
import { profileApi } from "./profile.api";
import type { KycRequestRecord } from "./profile.types";

const summarizeRequest = (request: KycRequestRecord) => {
  try {
    const parsed = JSON.parse(request.requested_value_json) as Record<string, unknown>;
    return Object.keys(parsed).filter((key) => parsed[key] !== undefined && parsed[key] !== "").join(", ") || "Profile update";
  } catch {
    return "Profile update";
  }
};

export const KycUpdatePage = () => {
  const requestsQuery = useQuery({
    queryKey: ["kyc-requests"],
    queryFn: () => profileApi.listKycRequests(),
  });

  return (
    <div>
      <PageHeader title="Profile Update Request" description="Request reviewed changes to official profile information." />
      <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">New request</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">At least one requested change and a reason are required.</p>
          <KycUpdateForm />
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Recent requests</h2>
          <DataTable
            columns={[
              { key: "created_at", header: "Date", cell: (row) => formatDate(row.created_at) },
              { key: "request_type", header: "Type" },
              { key: "requested_value_json", header: "Requested changes", cell: summarizeRequest },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            ]}
            rows={requestsQuery.data?.data ?? []}
            loading={requestsQuery.isLoading}
            getRowId={(row) => row.id}
            emptyTitle="No profile update requests yet"
            emptyDescription="Submitted requests will appear here for tracking."
          />
        </section>
      </div>
    </div>
  );
};
