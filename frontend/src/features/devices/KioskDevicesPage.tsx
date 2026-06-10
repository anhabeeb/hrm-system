import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TabletSmartphone } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import { DeviceDetailDrawer } from "./DeviceDetailDrawer";
import { DeviceFilters } from "./DeviceFilters";
import { DeviceRegistrationDialog } from "./DeviceRegistrationDialog";
import { DeviceStatusDialog } from "./DeviceStatusDialog";
import { DeviceTable } from "./DeviceTable";
import { devicesApi } from "./devices.api";
import { RotateDeviceTokenDialog } from "./RotateDeviceTokenDialog";
import type { DeviceFilters as DeviceFilterValues, DeviceMutationResult, DeviceRecord, RegisterDevicePayload } from "./devices.types";

const extractToken = (result: DeviceMutationResult) => result.device_token ?? result.raw_token ?? result.token ?? null;

export const KioskDevicesPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [statusDevice, setStatusDevice] = useState<DeviceRecord | null>(null);
  const [rotateDevice, setRotateDevice] = useState<DeviceRecord | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<DeviceFilterValues>(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    device_type: searchParams.get("device_type") || undefined,
    status: searchParams.get("status") || undefined,
    health_status: searchParams.get("health_status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<DeviceFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };

  const devicesQuery = useQuery({ queryKey: ["devices", filters], queryFn: () => devicesApi.list(filters) });
  const healthSummaryQuery = useQuery({ queryKey: ["devices", "reports-health"], queryFn: devicesApi.reportsHealth, retry: false });

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const registerMutation = useMutation({
    mutationFn: devicesApi.register,
    onSuccess: async (response) => {
      setOneTimeToken(extractToken(response.data));
      setSuccessMessage("Device registered successfully.");
      if (!extractToken(response.data)) setRegisterOpen(false);
      await refresh();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ device, reason }: { device: DeviceRecord; reason: string }) =>
      device.status === "active" ? devicesApi.disable(device.id, { reason }) : devicesApi.enable(device.id, { reason }),
    onSuccess: async () => {
      setSuccessMessage("Device status updated successfully.");
      setStatusDevice(null);
      await refresh();
    },
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => devicesApi.rotateToken(id, { reason }),
    onSuccess: async (response) => {
      setSuccessMessage("Device token rotated successfully.");
      setOneTimeToken(extractToken(response.data));
      await refresh();
    },
  });

  const canRegister = auth.hasAnyPermission(["devices.register", "sync.register_device"]);
  const canEdit = auth.hasAnyPermission(["devices.enable", "devices.disable", "sync.disable_device"]);
  const canRotate = auth.hasPermission("devices.rotate_token");

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {devicesQuery.isError ? <InlineAlert title="Device records could not be loaded." variant="error">Please adjust filters or try again.</InlineAlert> : null}
        {healthSummaryQuery.isError ? <InlineAlert title="Device health summary is not available for your role." variant="warning">The device table is still available if your device permissions allow it.</InlineAlert> : null}
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Device fleet</h2>
              <p className="text-sm text-muted-foreground">Token hashes are never rendered. New raw tokens are shown only once after register/rotate.</p>
            </div>
            {canRegister ? (
              <Button onClick={() => { setOneTimeToken(null); setRegisterOpen(true); }}>
                <TabletSmartphone className="h-4 w-4" />
                Register device
              </Button>
            ) : null}
          </div>
          {healthSummaryQuery.data?.data ? (
            <pre className="mt-3 max-h-28 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(healthSummaryQuery.data.data), null, 2)}</pre>
          ) : null}
        </div>
        <DeviceFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <DeviceTable
          rows={devicesQuery.data?.data ?? []}
          loading={devicesQuery.isLoading}
          pagination={devicesQuery.data?.pagination}
          canEdit={canEdit}
          canRotate={canRotate}
          onView={(device) => {
            setSelectedDevice(device);
            setDrawerOpen(true);
          }}
          onStatus={setStatusDevice}
          onRotate={(device) => {
            setOneTimeToken(null);
            setRotateDevice(device);
          }}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
        />
      </div>
      <DeviceDetailDrawer device={selectedDevice} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DeviceRegistrationDialog
        open={registerOpen}
        loading={registerMutation.isPending}
        error={registerMutation.error}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) setOneTimeToken(null);
        }}
        onSubmit={(payload: RegisterDevicePayload) => registerMutation.mutate(payload)}
      />
      {registerOpen && oneTimeToken ? (
        <RotateDeviceTokenDialog device={{ id: "new", status: "active", device_name: "Registered device" }} token={oneTimeToken} onOpenChange={(open) => { setRegisterOpen(open); if (!open) setOneTimeToken(null); }} onSubmit={() => undefined} />
      ) : null}
      <DeviceStatusDialog
        device={statusDevice}
        loading={statusMutation.isPending}
        error={statusMutation.error}
        onOpenChange={(open) => !open && setStatusDevice(null)}
        onSubmit={(reason) => statusDevice && statusMutation.mutate({ device: statusDevice, reason })}
      />
      <RotateDeviceTokenDialog
        device={rotateDevice}
        token={oneTimeToken}
        loading={rotateMutation.isPending}
        error={rotateMutation.error}
        onOpenChange={(open) => {
          if (!open) {
            setRotateDevice(null);
            setOneTimeToken(null);
          }
        }}
        onSubmit={(reason) => rotateDevice && rotateMutation.mutate({ id: rotateDevice.id, reason })}
      />
      {(registerMutation.error || statusMutation.error || rotateMutation.error) ? (
        <div className="p-4 md:p-6">
          <InlineAlert title={friendlyOperationalError(registerMutation.error ?? statusMutation.error ?? rotateMutation.error, "Device action could not be completed.")} variant="error" />
        </div>
      ) : null}
    </div>
  );
};
