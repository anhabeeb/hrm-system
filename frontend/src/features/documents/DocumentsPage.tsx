import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { DocumentCategoriesPanel } from "./DocumentCategoriesPanel";
import { DocumentDeleteDialog } from "./DocumentDeleteDialog";
import { DocumentDetailDrawer } from "./DocumentDetailDrawer";
import { DocumentFilters } from "./DocumentFilters";
import { DocumentKycDetailDrawer } from "./DocumentKycDetailDrawer";
import { DocumentKycRequestDialog } from "./DocumentKycRequestDialog";
import { DocumentKycRequestsTable } from "./DocumentKycRequestsTable";
import { DocumentUpdateDialog } from "./DocumentUpdateDialog";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { documentsApi } from "./documents.api";
import { documentName } from "./document-format";
import { DocumentsTable } from "./DocumentsTable";
import { ExpiringDocumentsTable } from "./ExpiringDocumentsTable";
import { MissingDocumentsTable } from "./MissingDocumentsTable";
import type { DocumentFilters as DocumentFilterValues, DocumentKycRequestPayload, DocumentKycRequestRecord, DocumentRecord, DocumentUpdatePayload, DocumentUploadPayload } from "./documents.types";

export const DocumentsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "documents");
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [selectedKyc, setSelectedKyc] = useState<DocumentKycRequestRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [kycDrawerOpen, setKycDrawerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [kycAction, setKycAction] = useState<"approve" | "reject" | "cancel" | "apply" | null>(null);
  const toast = useToast();
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewExpiring = has("documents.view_expiring");
  const canViewMissing = has("documents.view_missing");
  const canViewCategories = has("documents.view") || has("documents_settings.manage");
  const canViewKyc = has("documentKyc.requests.view") || has("documentKyc.requests.create") || has("documentKyc.requests.review") || has("documentKyc.requests.apply");
  const activeTab = tab === "expiring" && canViewExpiring ? "expiring" : tab === "missing" && canViewMissing ? "missing" : tab === "categories" && canViewCategories ? "categories" : tab === "kyc" && canViewKyc ? "kyc" : "documents";
  const filters = useMemo<DocumentFilterValues>(() => ({
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    document_type: searchParams.get("document_type") || undefined,
    status: searchParams.get("status") || undefined,
    employee_type: searchParams.get("employee_type") || undefined,
    expiry_from: searchParams.get("expiry_from") || undefined,
    expiry_to: searchParams.get("expiry_to") || undefined,
    expiring_within_days: searchParams.get("expiring_within_days") ? Number(searchParams.get("expiring_within_days")) : undefined,
    expiring_before: searchParams.get("expiring_before") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<DocumentFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", activeTab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => { setTab(value); const params = new URLSearchParams(searchParams); params.set("tab", value); params.set("page", "1"); setSearchParams(params); };
  const listQuery = useQuery({ queryKey: ["documents", "list", filters], queryFn: () => documentsApi.list(filters), enabled: activeTab === "documents" });
  const expiringQuery = useQuery({ queryKey: ["documents", "expiring", filters], queryFn: () => documentsApi.expiring(filters), enabled: activeTab === "expiring" && canViewExpiring });
  const missingQuery = useQuery({ queryKey: ["documents", "missing", filters], queryFn: () => documentsApi.missing(filters), enabled: activeTab === "missing" && canViewMissing });
  const categoriesQuery = useQuery({ queryKey: ["documents", "categories", filters], queryFn: () => documentsApi.categories(filters), enabled: activeTab === "categories" && canViewCategories, retry: false });
  const kycQuery = useQuery({ queryKey: ["documents", "kyc-requests", filters], queryFn: () => documentsApi.listKycRequests({ ...filters }), enabled: activeTab === "kyc" && canViewKyc });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const uploadMutation = useMutation({
    mutationFn: documentsApi.upload,
    onSuccess: async () => { toastSuccess(toast, "Document uploaded successfully."); setUploadOpen(false); await refresh(); },
    onError: (error) => toastError(toast, error, "Document could not be uploaded."),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: DocumentUpdatePayload) => documentsApi.update(selected!.id, payload),
    onSuccess: async () => { toastSuccess(toast, "Document updated successfully."); setUpdateOpen(false); await refresh(); },
    onError: (error) => toastError(toast, error, "Document could not be updated."),
  });
  const deleteMutation = useMutation({
    mutationFn: (reason: string) => documentsApi.delete(selected!.id, reason),
    onSuccess: async () => { toastSuccess(toast, "Document deleted successfully."); setDeleteOpen(false); await refresh(); },
    onError: (error) => toastError(toast, error, "Document could not be deleted."),
  });
  const createKycMutation = useMutation({
    mutationFn: async (payload: DocumentKycRequestPayload) => {
      const created = await documentsApi.createKycRequest(payload);
      return documentsApi.submitKycRequest(created.data.document_kyc_request.id);
    },
    onSuccess: async () => { toastSuccess(toast, "Document/KYC request submitted for approval."); setKycOpen(false); await refresh(); },
    onError: (error) => toastError(toast, error, "Document/KYC request could not be submitted."),
  });
  const kycActionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }) => {
      if (!selectedKyc || !kycAction) throw new Error("Select a document/KYC request first.");
      if (kycAction === "approve") return documentsApi.approveKycRequest(selectedKyc.id, reason || "Approved from Documents page.");
      if (kycAction === "reject") return documentsApi.rejectKycRequest(selectedKyc.id, reason);
      if (kycAction === "apply") return documentsApi.applyKycRequest(selectedKyc.id, reason || "Applied from Documents page.");
      return documentsApi.cancelKycRequest(selectedKyc.id, reason);
    },
    onSuccess: async () => {
      toastSuccess(toast, kycAction === "approve" ? "Document/KYC request approved." : kycAction === "reject" ? "Document/KYC request rejected." : kycAction === "apply" ? "Document/KYC request applied." : "Document/KYC request cancelled.");
      setKycAction(null);
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Document/KYC action could not be completed."),
  });
  const downloadMutation = useMutation({
    mutationFn: async (document: DocumentRecord) => ({ document, blob: await documentsApi.download(document.id) }),
    onSuccess: ({ document, blob }) => {
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = documentName(document, canViewSensitive) || "employee-document";
      link.click();
      window.URL.revokeObjectURL(url);
      toastSuccess(toast, "Document downloaded successfully.");
    },
    onError: (error) => toastError(toast, error, "Document could not be downloaded."),
  });
  const activeQueryError = activeTab === "expiring" ? expiringQuery.error : activeTab === "missing" ? missingQuery.error : activeTab === "categories" ? categoriesQuery.error : activeTab === "kyc" ? kycQuery.error : listQuery.error;
  const error = activeQueryError;
  const canViewSensitive = has("documents.view_sensitive");

  return (
    <div>
      {has("documents.upload") || has("documentKyc.requests.create") || has("documentKyc.requests.createForOthers") ? <PageActionBar label="Documents page actions"><div className="flex flex-wrap items-center justify-end gap-2">{has("documentKyc.requests.create") || has("documentKyc.requests.createForOthers") ? <Button variant="outline" onClick={() => setKycOpen(true)}>Request KYC update</Button> : null}{has("documents.upload") ? <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" />Upload document</Button> : null}</div></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert title={friendlyHrmError(error, "Document action could not be completed.")} variant="error" /> : null}
        <DocumentFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab: activeTab }))} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="documents">Documents</TabsTrigger>{canViewKyc ? <TabsTrigger value="kyc">KYC Requests</TabsTrigger> : null}{canViewExpiring ? <TabsTrigger value="expiring">Expiring</TabsTrigger> : null}{canViewMissing ? <TabsTrigger value="missing">Missing</TabsTrigger> : null}{canViewCategories ? <TabsTrigger value="categories">Categories</TabsTrigger> : null}</TabsList>
          <TabsContent value="documents"><DocumentsTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canViewSensitive={canViewSensitive} canDownload={has("documents.download")} canEdit={has("documents.edit")} canDelete={has("documents.delete")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onDownload={(row) => downloadMutation.mutate(row)} onUpdate={(row) => { setSelected(row); setUpdateOpen(true); }} onDelete={(row) => { setSelected(row); setDeleteOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          {canViewKyc ? <TabsContent value="kyc"><DocumentKycRequestsTable rows={kycQuery.data?.data ?? []} loading={kycQuery.isLoading} canApprove={has("documentKyc.requests.review") || has("documentKyc.requests.approve") || has("documentKyc.requests.finalApprove") || has("approvals.operationOwner.approve") || has("approvals.operationFinal.approve")} canReject={has("documentKyc.requests.reject") || has("approvals.operationOwner.reject") || has("approvals.operationFinal.reject")} canCancel={has("documentKyc.requests.cancel") || has("documentKyc.requests.cancelAny")} canApply={has("documentKyc.requests.apply") || has("employeeDocuments.verify") || has("approvals.operationExecutor.apply")} onView={(row) => { setSelectedKyc(row); setKycDrawerOpen(true); }} onApprove={(row) => { setSelectedKyc(row); setKycAction("approve"); }} onReject={(row) => { setSelectedKyc(row); setKycAction("reject"); }} onCancel={(row) => { setSelectedKyc(row); setKycAction("cancel"); }} onApply={(row) => { setSelectedKyc(row); setKycAction("apply"); }} /></TabsContent> : null}
          {canViewExpiring ? <TabsContent value="expiring"><ExpiringDocumentsTable rows={expiringQuery.data?.data ?? []} loading={expiringQuery.isLoading} pagination={expiringQuery.data?.pagination} canViewSensitive={canViewSensitive} canDownload={has("documents.download")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onDownload={(row) => downloadMutation.mutate(row)} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent> : null}
          {canViewMissing ? <TabsContent value="missing"><MissingDocumentsTable rows={missingQuery.data?.data ?? []} loading={missingQuery.isLoading} pagination={missingQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent> : null}
          {canViewCategories ? <TabsContent value="categories"><DocumentCategoriesPanel rows={categoriesQuery.data?.data ?? []} loading={categoriesQuery.isLoading} pagination={categoriesQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent> : null}
        </Tabs>
      </div>
      <DocumentDetailDrawer document={selected} canViewSensitive={canViewSensitive} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DocumentKycDetailDrawer request={selectedKyc} open={kycDrawerOpen} onOpenChange={setKycDrawerOpen} />
      <DocumentUploadDialog open={uploadOpen} loading={uploadMutation.isPending} error={uploadMutation.error ? friendlyHrmError(uploadMutation.error, "Document could not be uploaded.") : null} onOpenChange={setUploadOpen} onSubmit={(payload: DocumentUploadPayload) => uploadMutation.mutate(payload)} />
      <DocumentKycRequestDialog open={kycOpen} loading={createKycMutation.isPending} error={createKycMutation.error ? friendlyHrmError(createKycMutation.error, "Document/KYC request could not be submitted.") : null} currentEmployeeId={auth.user?.employee_id ?? null} canSelectEmployee={has("documentKyc.requests.createForOthers")} onOpenChange={setKycOpen} onSubmit={(payload) => createKycMutation.mutate(payload)} />
      <DocumentUpdateDialog document={selected} open={updateOpen} loading={updateMutation.isPending} error={updateMutation.error ? friendlyHrmError(updateMutation.error, "Document could not be updated.") : null} onOpenChange={setUpdateOpen} onSubmit={(payload: DocumentUpdatePayload) => updateMutation.mutate(payload)} />
      <DocumentDeleteDialog open={deleteOpen} loading={deleteMutation.isPending} error={deleteMutation.error ? friendlyHrmError(deleteMutation.error, "Document could not be deleted.") : null} onOpenChange={setDeleteOpen} onSubmit={(reason) => deleteMutation.mutate(reason)} />
      <DocumentDeleteDialog open={Boolean(kycAction)} loading={kycActionMutation.isPending} error={kycActionMutation.error ? friendlyHrmError(kycActionMutation.error, "Document/KYC action could not be completed.") : null} onOpenChange={(open) => !open && setKycAction(null)} onSubmit={(reason) => kycActionMutation.mutate({ reason })} />
    </div>
  );
};
