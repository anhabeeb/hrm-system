import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { auditLogsApi, type AuditLog } from "./audit-logs.api";

const jsonPreview = (value: unknown) => JSON.stringify(value ?? null, null, 2);

export const AuditLogsPage = () => {
  const [filters, setFilters] = useState({ date_from: "", date_to: "", actor_user_id: "", module: "", action: "", entity_type: "", entity_id: "", request_id: "", severity: "", page: 1, page_size: 25 });
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const query = useQuery({ queryKey: ["audit-logs", filters], queryFn: () => auditLogsApi.list(filters) });

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <InlineAlert title="Audit logs could not be loaded." variant="error" /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <div><Label>Date from</Label><Input className="mt-1" type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value, page: 1 }))} /></div>
          <div><Label>Date to</Label><Input className="mt-1" type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value, page: 1 }))} /></div>
          <div><Label>Actor user</Label><Input className="mt-1" value={filters.actor_user_id} onChange={(event) => setFilters((current) => ({ ...current, actor_user_id: event.target.value, page: 1 }))} /></div>
          <div><Label>Module</Label><Input className="mt-1" value={filters.module} onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value, page: 1 }))} /></div>
          <div><Label>Action</Label><Input className="mt-1" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value, page: 1 }))} /></div>
          <div><Label>Target type</Label><Input className="mt-1" value={filters.entity_type} onChange={(event) => setFilters((current) => ({ ...current, entity_type: event.target.value, page: 1 }))} /></div>
          <div><Label>Target ID</Label><Input className="mt-1" value={filters.entity_id} onChange={(event) => setFilters((current) => ({ ...current, entity_id: event.target.value, page: 1 }))} /></div>
          <div><Label>Request ID</Label><Input className="mt-1" value={filters.request_id} onChange={(event) => setFilters((current) => ({ ...current, request_id: event.target.value, page: 1 }))} /></div>
        </div>
        <DataTable
          compact
          loading={query.isLoading}
          rows={query.data?.data ?? []}
          pagination={query.data?.pagination}
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          getRowId={(row) => row.id}
          emptyTitle="No audit logs found."
          onRowClick={setSelected}
          columns={[
            { key: "created_at", header: "Timestamp" },
            { key: "module", header: "Module" },
            { key: "action", header: "Action" },
            { key: "actor_user_id", header: "Actor" },
            { key: "entity_type", header: "Target" },
            { key: "entity_id", header: "Target ID" },
            { key: "severity", header: "Severity", cell: (row) => <Badge variant="outline">{row.severity}</Badge> },
          ]}
          rowActions={(row) => <Button variant="outline" size="sm" onClick={() => setSelected(row)}>View</Button>}
        />
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Audit log detail</SheetTitle>
            <SheetDescription>Secrets, tokens, TOTP data, and storage keys are masked.</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-6 space-y-4 text-sm">
              <div className="grid gap-2 rounded-lg border p-4">
                <div><span className="font-medium">Actor:</span> {selected.actor_user_id ?? "System"}</div>
                <div><span className="font-medium">Action:</span> {selected.action}</div>
                <div><span className="font-medium">Module:</span> {selected.module}</div>
                <div><span className="font-medium">Target:</span> {selected.entity_type ?? "-"} / {selected.entity_id ?? "-"}</div>
                <div><span className="font-medium">IP/User agent:</span> {selected.ip_address ?? "-"} / {selected.user_agent ?? "-"}</div>
                <div><span className="font-medium">Timestamp:</span> {selected.created_at}</div>
              </div>
              <div>
                <h3 className="font-semibold">Before</h3>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">{jsonPreview(selected.old_value)}</pre>
              </div>
              <div>
                <h3 className="font-semibold">After</h3>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">{jsonPreview(selected.new_value)}</pre>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};
