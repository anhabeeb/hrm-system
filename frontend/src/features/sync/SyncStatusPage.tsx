import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import { ForceResyncDialog } from "./ForceResyncDialog";
import { ResolveSyncConflictDialog } from "./ResolveSyncConflictDialog";
import { syncApi } from "./sync.api";
import { SyncBatchDetailDrawer } from "./SyncBatchDetailDrawer";
import { SyncBatchTable } from "./SyncBatchTable";
import { SyncConflictTable } from "./SyncConflictTable";
import { SyncItemsTable } from "./SyncItemsTable";
import { SyncSummaryPanel } from "./SyncSummaryPanel";
import type { SyncBatch, SyncConflict, SyncFilters, SyncReasonPayload } from "./sync.types";

export const SyncStatusPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "batches");
  const [selectedRecord, setSelectedRecord] = useState<SyncBatch | SyncConflict | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<SyncFilters>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    device_id: searchParams.get("device_id") || undefined,
    status: searchParams.get("status") || undefined,
    conflict_type: searchParams.get("conflict_type") || undefined,
    entity_type: searchParams.get("entity_type") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<SyncFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", tab);
    setSearchParams(params);
  };

  const setActiveTab = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    params.set("page", "1");
    setSearchParams(params);
  };

  const statusQuery = useQuery({ queryKey: ["sync", "status", filters], queryFn: () => syncApi.status(filters) });
  const reportStatusQuery = useQuery({ queryKey: ["sync", "reports-status"], queryFn: syncApi.reportsStatus, retry: false });
  const batchesQuery = useQuery({ queryKey: ["sync", "batches", filters], queryFn: () => syncApi.listBatches(filters) });
  const conflictsQuery = useQuery({ queryKey: ["sync", "conflicts", filters], queryFn: () => syncApi.listConflicts(filters) });
  const healthQuery = useQuery({ queryKey: ["sync", "health", filters], queryFn: () => syncApi.health(filters) });

  const resolveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SyncReasonPayload }) => syncApi.resolveConflict(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Sync conflict resolved.");
      setSelectedConflict(null);
      await queryClient.invalidateQueries({ queryKey: ["sync"] });
    },
  });

  const forceMutation = useMutation({
    mutationFn: syncApi.forceResync,
    onSuccess: async () => {
      setSuccessMessage("Force resync requested successfully.");
      setForceOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sync"] });
    },
  });

  const canResolve = auth.hasPermission("sync.resolve_conflicts");
  const canForceResync = auth.hasPermission("sync.force_resync");

  return (
    <div>
      <PageHeader title="Sync Status" description="Monitor offline attendance sync batches, conflicts, and device state." />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {(statusQuery.isError || batchesQuery.isError || conflictsQuery.isError) ? <InlineAlert title="Sync data could not be loaded." variant="error" /> : null}
        {reportStatusQuery.isError ? <InlineAlert title="Sync report summary is not available for your role." variant="warning">The core sync status table remains available when permitted.</InlineAlert> : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Sync operations</h2>
            <p className="text-sm text-muted-foreground">Realtime only notifies; REST endpoints fetch the actual sync data.</p>
          </div>
          {canForceResync ? (
            <Button onClick={() => setForceOpen(true)}>
              <RefreshCw className="h-4 w-4" />
              Force resync
            </Button>
          ) : null}
        </div>
        <SyncSummaryPanel summary={statusQuery.data?.data} />
        {reportStatusQuery.data?.data ? <pre className="max-h-32 overflow-auto rounded border bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(reportStatusQuery.data.data), null, 2)}</pre> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-4">
          <OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value })} placeholder="All accessible outlets" />
          <Input placeholder="Device ID" value={filters.device_id ?? ""} onChange={(event) => updateFilters({ device_id: event.target.value })} />
          <Input placeholder="Status" value={filters.status ?? ""} onChange={(event) => updateFilters({ status: event.target.value })} />
          <Input placeholder="Conflict type" value={filters.conflict_type ?? ""} onChange={(event) => updateFilters({ conflict_type: event.target.value })} />
        </div>
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
            <TabsTrigger value="health">Device State</TabsTrigger>
          </TabsList>
          <TabsContent value="batches">
            <SyncBatchTable
              rows={batchesQuery.data?.data ?? []}
              loading={batchesQuery.isLoading}
              pagination={batchesQuery.data?.pagination}
              onView={(row) => {
                setSelectedRecord(row);
                setDrawerOpen(true);
              }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="items"><SyncItemsTable /></TabsContent>
          <TabsContent value="conflicts">
            <SyncConflictTable
              rows={conflictsQuery.data?.data ?? []}
              loading={conflictsQuery.isLoading}
              pagination={conflictsQuery.data?.pagination}
              canResolve={canResolve}
              onView={(row) => {
                setSelectedRecord(row);
                setDrawerOpen(true);
              }}
              onResolve={setSelectedConflict}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="health">
            <pre className="max-h-96 overflow-auto rounded border bg-muted p-4 text-xs">{JSON.stringify(sanitizeForDisplay(healthQuery.data?.data ?? {}), null, 2)}</pre>
          </TabsContent>
        </Tabs>
        {(resolveMutation.error || forceMutation.error) ? <InlineAlert title={friendlyOperationalError(resolveMutation.error ?? forceMutation.error, "Sync action could not be completed.")} variant="error" /> : null}
      </div>
      <SyncBatchDetailDrawer record={selectedRecord} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <ResolveSyncConflictDialog
        conflict={selectedConflict}
        loading={resolveMutation.isPending}
        error={resolveMutation.error}
        onOpenChange={(open) => !open && setSelectedConflict(null)}
        onSubmit={(payload) => selectedConflict && resolveMutation.mutate({ id: selectedConflict.id, payload })}
      />
      <ForceResyncDialog open={forceOpen} loading={forceMutation.isPending} error={forceMutation.error} onOpenChange={setForceOpen} onSubmit={forceMutation.mutate} />
    </div>
  );
};
