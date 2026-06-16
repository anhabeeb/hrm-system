import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentKycRequestPayload } from "./documents.types";

const noneValue = "__none";

const requestTypes = [
  { value: "PERSONAL_INFO_UPDATE", label: "Personal info update" },
  { value: "CONTACT_INFO_UPDATE", label: "Contact info update" },
  { value: "EMERGENCY_CONTACT_UPDATE", label: "Emergency contact update" },
  { value: "ADDRESS_UPDATE", label: "Address update" },
  { value: "BANK_ACCOUNT_UPDATE", label: "Bank account update" },
  { value: "PASSPORT_UPDATE", label: "Passport update" },
  { value: "NATIONAL_ID_UPDATE", label: "National ID update" },
  { value: "WORK_PERMIT_UPDATE", label: "Work permit update" },
  { value: "VISA_UPDATE", label: "Visa update" },
  { value: "CONTRACT_DOCUMENT_UPDATE", label: "Contract document update" },
  { value: "MEDICAL_DOCUMENT_UPDATE", label: "Medical document update" },
  { value: "PROFILE_PHOTO_UPDATE", label: "Profile photo update" },
  { value: "DEPENDENT_INFO_UPDATE", label: "Dependent info update" },
  { value: "DOCUMENT_RENEWAL", label: "Document renewal" },
  { value: "DOCUMENT_CORRECTION", label: "Document correction" },
  { value: "DOCUMENT_VERIFICATION", label: "Document verification" },
  { value: "GENERAL_KYC_UPDATE", label: "General KYC update" },
  { value: "OTHER_DOCUMENT_UPDATE", label: "Other document update" },
];

const documentTypes = [
  { value: "PASSPORT", label: "Passport" },
  { value: "NATIONAL_ID", label: "National ID" },
  { value: "WORK_PERMIT", label: "Work permit" },
  { value: "VISA", label: "Visa" },
  { value: "EMPLOYMENT_CONTRACT", label: "Employment contract" },
  { value: "MEDICAL_CERTIFICATE", label: "Medical certificate" },
  { value: "BANK_DOCUMENT", label: "Bank document" },
  { value: "PROFILE_PHOTO", label: "Profile photo" },
  { value: "ADDRESS_PROOF", label: "Address proof" },
  { value: "EMERGENCY_CONTACT_DOCUMENT", label: "Emergency contact document" },
  { value: "OTHER", label: "Other" },
];

const fieldOptionsByRequestType: Record<string, Array<{ value: string; label: string; placeholder?: string }>> = {
  PERSONAL_INFO_UPDATE: [
    { value: "nationality", label: "Nationality" },
    { value: "id_card_number", label: "National ID number" },
    { value: "passport_number", label: "Passport number" },
    { value: "notes", label: "Notes" },
  ],
  CONTACT_INFO_UPDATE: [
    { value: "phone", label: "Phone", placeholder: "Enter phone number" },
    { value: "email", label: "Email", placeholder: "Enter email address" },
    { value: "address", label: "Address", placeholder: "Enter address" },
  ],
  EMERGENCY_CONTACT_UPDATE: [
    { value: "emergency_contact_name", label: "Emergency contact name" },
    { value: "emergency_contact_phone", label: "Emergency contact phone" },
    { value: "emergency_contact_relationship", label: "Relationship" },
  ],
  ADDRESS_UPDATE: [{ value: "address", label: "Address", placeholder: "Enter address" }],
  BANK_ACCOUNT_UPDATE: [
    { value: "bank_name", label: "Bank name" },
    { value: "bank_account_masked", label: "Masked account number" },
    { value: "bank_account_holder", label: "Account holder" },
  ],
  PASSPORT_UPDATE: [{ value: "passport_number", label: "Passport number" }],
  NATIONAL_ID_UPDATE: [{ value: "id_card_number", label: "National ID number" }],
  DEPENDENT_INFO_UPDATE: [{ value: "notes", label: "Dependent information notes" }],
  DOCUMENT_CORRECTION: [{ value: "notes", label: "Correction notes" }],
  DOCUMENT_VERIFICATION: [{ value: "notes", label: "Verification notes" }],
  GENERAL_KYC_UPDATE: [
    { value: "phone", label: "Phone" },
    { value: "address", label: "Address" },
    { value: "nationality", label: "Nationality" },
    { value: "notes", label: "Notes" },
  ],
};

const documentRelatedTypes = new Set([
  "PASSPORT_UPDATE",
  "NATIONAL_ID_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "CONTRACT_DOCUMENT_UPDATE",
  "MEDICAL_DOCUMENT_UPDATE",
  "PROFILE_PHOTO_UPDATE",
  "DOCUMENT_RENEWAL",
  "DOCUMENT_CORRECTION",
  "DOCUMENT_VERIFICATION",
  "OTHER_DOCUMENT_UPDATE",
]);

const dateRelatedTypes = new Set([
  "PASSPORT_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "CONTRACT_DOCUMENT_UPDATE",
  "MEDICAL_DOCUMENT_UPDATE",
  "DOCUMENT_RENEWAL",
  "DOCUMENT_CORRECTION",
  "DOCUMENT_VERIFICATION",
  "OTHER_DOCUMENT_UPDATE",
]);

const countryRelatedTypes = new Set(["PASSPORT_UPDATE", "WORK_PERMIT_UPDATE", "VISA_UPDATE", "DOCUMENT_RENEWAL", "DOCUMENT_CORRECTION"]);

const defaultDocumentTypeForRequest = (requestType: string) => {
  if (requestType === "PASSPORT_UPDATE") return "PASSPORT";
  if (requestType === "NATIONAL_ID_UPDATE") return "NATIONAL_ID";
  if (requestType === "WORK_PERMIT_UPDATE") return "WORK_PERMIT";
  if (requestType === "VISA_UPDATE") return "VISA";
  if (requestType === "CONTRACT_DOCUMENT_UPDATE") return "EMPLOYMENT_CONTRACT";
  if (requestType === "MEDICAL_DOCUMENT_UPDATE") return "MEDICAL_CERTIFICATE";
  if (requestType === "PROFILE_PHOTO_UPDATE") return "PROFILE_PHOTO";
  return documentRelatedTypes.has(requestType) ? "OTHER" : "";
};

interface DocumentKycRequestDialogProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: DocumentKycRequestPayload) => void;
}

export const DocumentKycRequestDialog = ({ open, loading, error, currentEmployeeId, canSelectEmployee, onOpenChange, onSubmit }: DocumentKycRequestDialogProps) => {
  const [payload, setPayload] = useState({
    employee_id: currentEmployeeId ?? "",
    request_type: "GENERAL_KYC_UPDATE",
    document_type: "",
    requested_field: "",
    requested_value: "",
    document_number: "",
    issue_date: "",
    expiry_date: "",
    issuing_country: "",
    reason: "",
    employee_note: "",
  });
  const [clientError, setClientError] = useState<string | null>(null);

  const selectedFieldOptions = fieldOptionsByRequestType[payload.request_type] ?? [];
  const selectedField = selectedFieldOptions.find((option) => option.value === payload.requested_field);
  const showDocumentFields = documentRelatedTypes.has(payload.request_type);
  const showDates = dateRelatedTypes.has(payload.request_type);
  const showCountry = countryRelatedTypes.has(payload.request_type);

  const submit = () => {
    setClientError(null);
    if (canSelectEmployee && !payload.employee_id) return setClientError("Please select an employee.");
    if (!canSelectEmployee && !currentEmployeeId) return setClientError("Your employee profile is not linked to this login. Please contact HR.");
    if (showDocumentFields && !payload.document_type) return setClientError("Please select a document type.");
    if (showDocumentFields) return setClientError("A secure document upload or existing document record is required for this request type.");
    if (selectedFieldOptions.length > 0 && !payload.requested_field) return setClientError("Please select the field you want HR to review.");
    if (selectedFieldOptions.length > 0 && !payload.requested_value.trim()) return setClientError("Please enter the requested value.");
    if (!payload.reason.trim()) return setClientError("A reason is required.");
    const requestedValue = payload.requested_field.trim()
      ? { [payload.requested_field.trim()]: payload.requested_value.trim() }
      : payload.requested_value.trim()
        ? { notes: payload.requested_value.trim() }
        : null;
    onSubmit({
      employee_id: canSelectEmployee ? payload.employee_id : currentEmployeeId,
      request_type: payload.request_type,
      document_type: payload.document_type || null,
      requested_field: payload.requested_field || null,
      requested_value_json: requestedValue,
      document_number: payload.document_number || null,
      issue_date: payload.issue_date || null,
      expiry_date: payload.expiry_date || null,
      issuing_country: payload.issuing_country || null,
      reason: payload.reason,
      employee_note: payload.employee_note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request Document / KYC Update</DialogTitle>
          <DialogDescription>Protected HR profile and document changes are reviewed before they are applied.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {canSelectEmployee ? (
            <Label className="space-y-1 text-sm md:col-span-2">
              Employee
              <EmployeeCombobox value={payload.employee_id} onChange={(value) => setPayload((current) => ({ ...current, employee_id: value ?? "" }))} />
            </Label>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground md:col-span-2">Employee is locked to your linked profile.</div>
          )}
          <Label className="space-y-1 text-sm">
            Request type
            <Select
              value={payload.request_type}
              onValueChange={(value) => setPayload((current) => ({
                ...current,
                request_type: value,
                document_type: defaultDocumentTypeForRequest(value),
                requested_field: "",
                requested_value: "",
              }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{requestTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          {showDocumentFields ? (
            <Label className="space-y-1 text-sm">
              Document type
              <Select value={payload.document_type || noneValue} onValueChange={(value) => setPayload((current) => ({ ...current, document_type: value === noneValue ? "" : value }))}>
                <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={noneValue}>Select document type</SelectItem>
                  {documentTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          ) : null}
          {selectedFieldOptions.length > 0 ? (
            <Label className="space-y-1 text-sm">
              Requested field
              <Select value={payload.requested_field || noneValue} onValueChange={(value) => setPayload((current) => ({ ...current, requested_field: value === noneValue ? "" : value, requested_value: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={noneValue}>No profile field</SelectItem>
                  {selectedFieldOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          ) : null}
          {selectedFieldOptions.length > 0 ? (
            <Label className="space-y-1 text-sm">
              Requested value
              <Input value={payload.requested_value} onChange={(event) => setPayload((current) => ({ ...current, requested_value: event.target.value }))} placeholder={selectedField?.placeholder ?? "Enter requested value"} />
            </Label>
          ) : null}
          {showDocumentFields ? (
            <Label className="space-y-1 text-sm">
              Document number
              <Input value={payload.document_number} onChange={(event) => setPayload((current) => ({ ...current, document_number: event.target.value }))} placeholder="Document number, if applicable" />
            </Label>
          ) : null}
          {showDates ? (
            <>
              <AppDatePicker label="Issue date" value={payload.issue_date} onChange={(value) => setPayload((current) => ({ ...current, issue_date: value ?? "" }))} />
              <AppDatePicker label="Expiry date" value={payload.expiry_date} onChange={(value) => setPayload((current) => ({ ...current, expiry_date: value ?? "" }))} />
            </>
          ) : null}
          {showCountry ? (
            <Label className="space-y-1 text-sm">
              Issuing country
              <Input value={payload.issuing_country} onChange={(event) => setPayload((current) => ({ ...current, issuing_country: event.target.value }))} placeholder="Country" />
            </Label>
          ) : null}
          {showDocumentFields ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
              A secure document upload or existing document record is required for this request type. Secure document upload will be available through the document upload flow.
            </div>
          ) : null}
          <Label className="space-y-1 text-sm md:col-span-2">Reason<Textarea value={payload.reason} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm md:col-span-2">Employee note<Textarea value={payload.employee_note} onChange={(event) => setPayload((current) => ({ ...current, employee_note: event.target.value }))} /></Label>
          <FormError message={clientError ?? error ?? undefined} />
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Submit for approval</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
