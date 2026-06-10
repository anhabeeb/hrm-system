import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Fingerprint, Plus } from "lucide-react";

import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import { biometricApi } from "./biometric.api";
import { BiometricDeviceDialog } from "./BiometricDeviceDialog";
import { BiometricDeviceTable } from "./BiometricDeviceTable";
import { BiometricLogsTable } from "./BiometricLogsTable";
import { BiometricMappingDialog } from "./BiometricMappingDialog";
import { BiometricMappingsTable } from "./BiometricMappingsTable";
import { BiometricReasonDialog } from "./BiometricReasonDialog";
import { ReprocessBiometricLogDialog } from "./ReprocessBiometricLogDialog";
import { UnmatchedBiometricTable } from "./UnmatchedBiometricTable";
import type { BiometricDevice, BiometricDevicePayload, BiometricFilters, BiometricLog, BiometricMapping, BiometricMappingPayload, BiometricMutationResult, BiometricReasonPayload } from "./biometric.types";

const extractToken = (result: BiometricMutationResult) => result.device_token ?? result.raw_token ?? result.token ?? null;

export const BiometricPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "devices");
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<BiometricDevice | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<BiometricMapping | null>(null);
  const [selectedLog, setSelectedLog] = useState<BiometricLog | null>(null);
  const [unmatchedLog, setUnmatchedLog] = useState<BiometricLog | null>(null);
  const [detailLog, setDetailLog] = useState<BiometricLog | null>(null);
  const [reasonAction, setReasonAction] = useState<"device-status" | "rotate" | "revoke" | "disable-mapping" | "reject-log" | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<BiometricFilters>(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    device_id: searchParams.get("device_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    biometric_user_id: searchParams.get("biometric_user_id") || undefined,
    event_type: searchParams.get("event_type") || undefined,
    sync_status: searchParams.get("sync_status") || undefined,
    status: searchParams.get("status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<BiometricFilters>) => {
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

  const devicesQuery = useQuery({ queryKey: ["biometric", "devices", filters], queryFn: () => biometricApi.listDevices(filters) });
  const mappingsQuery = useQuery({ queryKey: ["biometric", "mappings", filters], queryFn: () => biometricApi.listMappings(filters) });
  const logsQuery = useQuery({ queryKey: ["biometric", "logs", filters], queryFn: () => biometricApi.listLogs(filters) });
  const unmatchedQuery = useQuery({ queryKey: ["biometric", "unmatched", filters], queryFn: () => biometricApi.listUnmatched(filters) });

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["biometric"] });

  const deviceMutation = useMutation({
    mutationFn: ({ device, payload }: { device?: BiometricDevice | null; payload: BiometricDevicePayload }) => device ? biometricApi.updateDevice(device.id, payload) : biometricApi.createDevice(payload),
    onSuccess: async (response) => {
      setOneTimeToken(extractToken(response.data));
      setSuccessMessage("Biometric device registered successfully.");
      setDeviceDialogOpen(false);
      setSelectedDevice(null);
      await refresh();
    },
  });

  const deviceReasonMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!selectedDevice) throw new Error("Device is required.");
      if (reasonAction === "rotate") return biometricApi.rotateDeviceToken(selectedDevice.id, { reason });
      if (reasonAction === "revoke") return biometricApi.revokeDevice(selectedDevice.id, { reason });
      if (selectedDevice.status === "active") return biometricApi.disableDevice(selectedDevice.id, { reason });
      return biometricApi.enableDevice(selectedDevice.id, { reason });
    },
    onSuccess: async (response) => {
      setOneTimeToken(extractToken(response.data));
      setSuccessMessage(reasonAction === "rotate" ? "Biometric device token rotated successfully." : reasonAction === "revoke" ? "Biometric device revoked successfully." : "Biometric device status updated successfully.");
      setReasonAction(null);
      setSelectedDevice(null);
      await refresh();
    },
  });

  const mappingMutation = useMutation({
    mutationFn: (payload: BiometricMappingPayload | BiometricReasonPayload) => {
      if (unmatchedLog) return biometricApi.mapUnmatched(unmatchedLog.id, payload as BiometricReasonPayload);
      if (selectedMapping) return biometricApi.updateMapping(selectedMapping.id, payload as Partial<BiometricMappingPayload>);
      return biometricApi.createMapping(payload as BiometricMappingPayload);
    },
    onSuccess: async () => {
      setSuccessMessage(unmatchedLog ? "Biometric user mapped and punch reprocessed successfully." : "Biometric mapping saved successfully.");
      setSelectedMapping(null);
      setUnmatchedLog(null);
      await refresh();
    },
  });

  const disableMappingMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => selectedMapping ? biometricApi.disableMapping(selectedMapping.id, { reason }) : Promise.reject(new Error("Mapping is required.")),
    onSuccess: async () => {
      setSuccessMessage("Employee biometric mapping disabled successfully.");
      setSelectedMapping(null);
      setReasonAction(null);
      await refresh();
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => biometricApi.reprocessLog(id, { reason }),
    onSuccess: async () => {
      setSuccessMessage("Biometric log reprocess requested successfully.");
      setSelectedLog(null);
      await refresh();
    },
  });

  const rejectLogMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => biometricApi.rejectLog(id, { reason }),
    onSuccess: async () => {
      setSuccessMessage("Biometric punch rejected successfully.");
      setSelectedLog(null);
      setReasonAction(null);
      await refresh();
    },
  });

  const canManageDevices = auth.hasPermission("biometric.manage_devices");
  const canMap = auth.hasPermission("biometric.map_employee");
  const canResolve = auth.hasAnyPermission(["biometric.resolve_punches", "biometric.resolve_unmatched", "biometric.sync"]);

  const actionError = deviceMutation.error ?? deviceReasonMutation.error ?? mappingMutation.error ?? disableMappingMutation.error ?? reprocessMutation.error ?? rejectLogMutation.error;

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {oneTimeToken ? (
          <InlineAlert title="New device token" variant="warning">
            <code className="mt-2 block break-all rounded bg-background p-2">{oneTimeToken}</code>
            This token is shown only once and is not stored in localStorage or sessionStorage.
          </InlineAlert>
        ) : null}
        {(devicesQuery.isError || mappingsQuery.isError || logsQuery.isError || unmatchedQuery.isError) ? <InlineAlert title="Biometric data could not be loaded." variant="error" /> : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Biometric operations</h2>
            <p className="text-sm text-muted-foreground">Punch logs only. Templates, images, and token hashes are never rendered.</p>
          </div>
          {canManageDevices ? (
            <Button onClick={() => { setSelectedDevice(null); setOneTimeToken(null); setDeviceDialogOpen(true); }}>
              <Fingerprint className="h-4 w-4" />
              Register biometric device
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-4">
          <OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" />
          <Input placeholder="Device ID" value={filters.device_id ?? ""} onChange={(event) => updateFilters({ device_id: event.target.value })} />
          <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => updateFilters({ employee_id: value })} placeholder="All employees" />
          <Input placeholder="Biometric User ID" value={filters.biometric_user_id ?? ""} onChange={(event) => updateFilters({ biometric_user_id: event.target.value })} />
        </div>
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="mappings">Mappings</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
          </TabsList>
          <TabsContent value="devices">
            <BiometricDeviceTable
              rows={devicesQuery.data?.data ?? []}
              loading={devicesQuery.isLoading}
              pagination={devicesQuery.data?.pagination}
              canManage={canManageDevices}
              onEdit={(device) => { setSelectedDevice(device); setDeviceDialogOpen(true); }}
              onStatus={(device) => { setSelectedDevice(device); setReasonAction("device-status"); }}
              onRevoke={(device) => { setSelectedDevice(device); setReasonAction("revoke"); }}
              onRotate={(device) => { setSelectedDevice(device); setReasonAction("rotate"); setOneTimeToken(null); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="mappings">
            <BiometricMappingsTable
              rows={mappingsQuery.data?.data ?? []}
              loading={mappingsQuery.isLoading}
              pagination={mappingsQuery.data?.pagination}
              canMap={canMap}
              onEdit={(mapping) => setSelectedMapping(mapping)}
              onDisable={(mapping) => { setSelectedMapping(mapping); setReasonAction("disable-mapping"); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="logs">
            <BiometricLogsTable
              rows={logsQuery.data?.data ?? []}
              loading={logsQuery.isLoading}
              pagination={logsQuery.data?.pagination}
              canReprocess={canResolve}
              onView={setDetailLog}
              onReprocess={setSelectedLog}
              onReject={(log) => { setSelectedLog(log); setReasonAction("reject-log"); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="unmatched">
            <UnmatchedBiometricTable
              rows={unmatchedQuery.data?.data ?? []}
              loading={unmatchedQuery.isLoading}
              pagination={unmatchedQuery.data?.pagination}
              canMap={auth.hasAnyPermission(["biometric.resolve_punches", "biometric.resolve_unmatched"])}
              onMap={setUnmatchedLog}
              onReject={(log) => { setSelectedLog(log); setReasonAction("reject-log"); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
        </Tabs>
        {actionError ? <InlineAlert title={friendlyOperationalError(actionError, "Biometric action could not be completed.")} variant="error" /> : null}
      </div>
      <BiometricDeviceDialog
        open={deviceDialogOpen}
        device={selectedDevice}
        loading={deviceMutation.isPending}
        error={deviceMutation.error}
        onOpenChange={setDeviceDialogOpen}
        onSubmit={(payload) => deviceMutation.mutate({ device: selectedDevice, payload })}
      />
      <BiometricMappingDialog
        open={Boolean(selectedMapping || unmatchedLog)}
        mapping={selectedMapping}
        unmatchedLog={unmatchedLog}
        loading={mappingMutation.isPending}
        error={mappingMutation.error}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMapping(null);
            setUnmatchedLog(null);
          }
        }}
        onSubmit={(payload) => mappingMutation.mutate(payload)}
      />
      <ReprocessBiometricLogDialog
        log={selectedLog}
        loading={reprocessMutation.isPending}
        error={reprocessMutation.error}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        onSubmit={(reason) => selectedLog && reprocessMutation.mutate({ id: selectedLog.id, reason })}
      />
      <BiometricReasonDialog
        open={Boolean(reasonAction)}
        title={reasonAction === "rotate" ? "Rotate biometric device token" : reasonAction === "revoke" ? "Revoke biometric device" : reasonAction === "disable-mapping" ? "Disable biometric mapping" : reasonAction === "reject-log" ? "Reject biometric punch" : "Update biometric device status"}
        description="A reason is required for audit history."
        loading={deviceReasonMutation.isPending || disableMappingMutation.isPending || rejectLogMutation.isPending}
        error={deviceReasonMutation.error ?? disableMappingMutation.error ?? rejectLogMutation.error}
        onOpenChange={(open) => !open && setReasonAction(null)}
        onSubmit={(reason) => {
          if (reasonAction === "disable-mapping") disableMappingMutation.mutate({ reason });
          else if (reasonAction === "reject-log" && selectedLog) rejectLogMutation.mutate({ id: selectedLog.id, reason });
          else deviceReasonMutation.mutate({ reason });
        }}
      />
      <DetailDrawer open={Boolean(detailLog)} onOpenChange={(open) => !open && setDetailLog(null)} title="Biometric log detail" subtitle={detailLog?.biometric_user_id}>
        {detailLog ? <DetailSection title="Safe log detail" rows={[{ label: "Payload", value: <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(detailLog), null, 2)}</pre> }]} /> : null}
      </DetailDrawer>
    </div>
  );
};
