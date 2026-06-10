import type { Context } from "hono";

import * as employeesService from "./employees.service";
import * as documentsService from "../documents/documents.service";
import {
  validateEmployeeCreateInput,
  validateEmployeeLoginCreateInput,
  validateEmployeeListFilters,
  validateEmployeeNoteInput,
  validateEmployeeStatusInput,
  validateEmployeeUpdateInput,
  validateJobChangeInput,
  validateOutletAssignmentInput,
  validateSalaryHistoryInput,
  validateCompensationComponentChangeInput,
  validateCompensationDefinitionFilters,
  validateCompensationDefinitionInput,
  validateCompensationComponentEndInput,
  validateCompensationComponentInput,
} from "./employees.validators";
import {
  validateDocumentArchive,
  validateDocumentReplace,
  validateDocumentUpdate,
  validateDocumentUpload,
} from "../documents/documents.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");

  if (!authUser) {
    throw new AuthError("Please sign in to continue.");
  }

  return authUser;
};

const readJson = async (c: Context<AppContext>): Promise<unknown> =>
  c.req.json().catch(() => ({}));

const requiredId = (c: Context<AppContext>): string => {
  const id = c.req.param("id");

  if (!id) {
    throw new ValidationError("Employee is required.");
  }

  return id;
};

const requiredParam = (c: Context<AppContext>, name: string): string => {
  const value = c.req.param(name);

  if (!value) {
    throw new ValidationError("Please choose a valid record.");
  }

  return value;
};

const requiredDocumentId = (c: Context<AppContext>): string => {
  const id = c.req.param("documentId");

  if (!id) {
    throw new ValidationError("Document is required.");
  }

  return id;
};

const requiredComponentId = (c: Context<AppContext>): string => {
  const id = c.req.param("componentId");

  if (!id) {
    throw new ValidationError("Compensation component is required.");
  }

  return id;
};

const reasonFromBody = async (c: Context<AppContext>): Promise<string> => {
  const body = (await readJson(c)) as { reason?: unknown; review_notes?: unknown };
  const reason =
    typeof body.reason === "string"
      ? body.reason.trim()
      : typeof body.review_notes === "string"
        ? body.review_notes.trim()
        : "";

  if (reason.length < 3) {
    throw new ValidationError("A reason is required for this action.");
  }

  return reason;
};

export const listEmployees = async (c: Context<AppContext>) => {
  const result = await employeesService.listEmployees(
    c.env,
    actor(c),
    validateEmployeeListFilters({
      search: c.req.query("search"),
      outlet_id: c.req.query("outlet_id"),
      department_id: c.req.query("department_id"),
      position_id: c.req.query("position_id"),
      employment_status: c.req.query("employment_status"),
      employee_type: c.req.query("employee_type"),
      nationality: c.req.query("nationality"),
      joined_from: c.req.query("joined_from"),
      joined_to: c.req.query("joined_to"),
      document_expiring_before: c.req.query("document_expiring_before"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_by: c.req.query("sort_by"),
      sort_direction: c.req.query("sort_direction"),
    }),
  );

  return paginated(result.rows, result.pagination, "Employees loaded successfully.", {
    requestId: c.get("requestId"),
  });
};

export const getEmployee = async (c: Context<AppContext>) =>
  ok(
    { employee: await employeesService.getEmployee(c.env, actor(c), requiredId(c)) },
    "Employee loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const createEmployeeLogin = async (c: Context<AppContext>) =>
  created(
    await employeesService.createEmployeeLogin(
      c.env,
      actor(c),
      requiredId(c),
      validateEmployeeLoginCreateInput(await readJson(c)),
    ),
    "Login account created for employee.",
    { requestId: c.get("requestId") },
  );

const profileLimit = (c: Context<AppContext>) => {
  const limit = Number(c.req.query("limit") ?? 25);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
};

const profileResponse = <T>(c: Context<AppContext>, data: T, filters: Record<string, unknown> = {}) =>
  ok(
    {
      data,
      filters,
      generated_at: new Date().toISOString(),
    },
    "Employee profile section loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const getEmployeeProfile = async (c: Context<AppContext>) =>
  ok(
    await employeesService.getEmployeeProfile(c.env, actor(c), requiredId(c), profileLimit(c)),
    "Employee 360 profile loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const getEmployeeProfileSummary = async (c: Context<AppContext>) =>
  profileResponse(c, await employeesService.getEmployeeProfileSummary(c.env, actor(c), requiredId(c)));

export const getEmployeeProfileAttendance = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileAttendance(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileLeave = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileLeave(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileLongLeave = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileLongLeave(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileDocuments = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileDocuments(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileContracts = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileContracts(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileAssets = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileAssets(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfilePayrollReadiness = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfilePayrollReadiness(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileAlerts = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileAlerts(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const getEmployeeProfileTimeline = async (c: Context<AppContext>) =>
  profileResponse(
    c,
    await employeesService.getEmployeeProfileTimeline(c.env, actor(c), requiredId(c), profileLimit(c)),
    { limit: profileLimit(c) },
  );

export const createEmployee = async (c: Context<AppContext>) =>
  created(
    await employeesService.createEmployee(
      c.env,
      actor(c),
      validateEmployeeCreateInput(await readJson(c)),
    ),
    "Employee created successfully.",
    { requestId: c.get("requestId") },
  );

export const updateEmployee = async (c: Context<AppContext>) =>
  ok(
    await employeesService.updateEmployee(
      c.env,
      actor(c),
      requiredId(c),
      validateEmployeeUpdateInput(await readJson(c)),
    ),
    "Employee updated successfully.",
    { requestId: c.get("requestId") },
  );

export const archiveEmployee = async (c: Context<AppContext>) =>
  ok(
    await employeesService.archiveEmployee(
      c.env,
      actor(c),
      requiredId(c),
      await reasonFromBody(c),
    ),
    "Employee archived successfully.",
    { requestId: c.get("requestId") },
  );

export const restoreEmployee = async (c: Context<AppContext>) =>
  ok(
    await employeesService.restoreEmployee(
      c.env,
      actor(c),
      requiredId(c),
      await reasonFromBody(c),
    ),
    "Employee restored successfully.",
    { requestId: c.get("requestId") },
  );

export const changeStatus = async (c: Context<AppContext>) =>
  ok(
    await employeesService.changeStatus(
      c.env,
      actor(c),
      requiredId(c),
      validateEmployeeStatusInput(await readJson(c)),
    ),
    "Employee status updated successfully.",
    { requestId: c.get("requestId") },
  );

export const assignOutlet = async (c: Context<AppContext>) =>
  ok(
    await employeesService.assignOutlet(
      c.env,
      actor(c),
      requiredId(c),
      validateOutletAssignmentInput(await readJson(c)),
    ),
    "Employee outlet assignment updated successfully.",
    { requestId: c.get("requestId") },
  );

export const changeJob = async (c: Context<AppContext>) => {
  const result = await employeesService.changeJob(
    c.env,
    actor(c),
    requiredId(c),
    validateJobChangeInput(await readJson(c)),
  );
  return ok(
    result,
    (result as { approval_required?: boolean }).approval_required
      ? "Promotion submitted for approval."
      : "Job change recorded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const listJobHistory = async (c: Context<AppContext>) =>
  ok(
    { history: await employeesService.listJobHistory(c.env, actor(c), requiredId(c)) },
    "Employee job history loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const listStatusHistory = async (c: Context<AppContext>) =>
  ok(
    {
      history: await employeesService.listStatusHistory(
        c.env,
        actor(c),
        requiredId(c),
      ),
    },
    "Employee status history loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const listSalaryHistory = async (c: Context<AppContext>) =>
  ok(
    {
      history: await employeesService.listSalaryHistory(
        c.env,
        actor(c),
        requiredId(c),
      ),
    },
    "Employee salary history loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const addSalaryHistory = async (c: Context<AppContext>) => {
  const result = await employeesService.addSalaryHistory(
    c.env,
    actor(c),
    requiredId(c),
    validateSalaryHistoryInput(await readJson(c)),
  );
  return created(
    result,
    (result as { approval_required?: boolean }).approval_required
      ? "Salary change submitted for approval."
      : "Salary record added successfully.",
    { requestId: c.get("requestId") },
  );
};

export const getCompensationSummary = async (c: Context<AppContext>) =>
  ok(
    {
      summary: await employeesService.getCompensationSummary(
        c.env,
        actor(c),
        requiredId(c),
      ),
    },
    "Compensation summary loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const listCompensationComponents = async (c: Context<AppContext>) =>
  ok(
    {
      components: await employeesService.listCompensationComponents(
        c.env,
        actor(c),
        requiredId(c),
      ),
    },
    "Compensation components loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const createCompensationComponent = async (c: Context<AppContext>) =>
  created(
    await employeesService.createCompensationComponent(
      c.env,
      actor(c),
      requiredId(c),
      validateCompensationComponentInput(await readJson(c)),
    ),
    "Compensation component added successfully.",
    { requestId: c.get("requestId") },
  );

export const changeCompensationComponent = async (c: Context<AppContext>) =>
  ok(
    await employeesService.changeCompensationComponent(
      c.env,
      actor(c),
      requiredId(c),
      requiredComponentId(c),
      validateCompensationComponentChangeInput(await readJson(c)),
    ),
    "Compensation component changed successfully.",
    { requestId: c.get("requestId") },
  );

export const endCompensationComponent = async (c: Context<AppContext>) =>
  ok(
    await employeesService.endCompensationComponent(
      c.env,
      actor(c),
      requiredId(c),
      requiredComponentId(c),
      validateCompensationComponentEndInput(await readJson(c)),
    ),
    "Compensation component ended successfully.",
    { requestId: c.get("requestId") },
  );

export const listCompensationComponentDefinitions = async (c: Context<AppContext>) => {
  const result = await employeesService.listCompensationComponentDefinitions(
    c.env,
    actor(c),
    validateCompensationDefinitionFilters({
      search: c.req.query("search"),
      component_type: c.req.query("component_type"),
      status: c.req.query("status"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    }),
  );

  return paginated(result.rows, result.pagination, "Compensation component definitions loaded successfully.", {
    requestId: c.get("requestId"),
  });
};

export const createCompensationComponentDefinition = async (c: Context<AppContext>) =>
  created(
    await employeesService.createCompensationComponentDefinition(
      c.env,
      actor(c),
      validateCompensationDefinitionInput(await readJson(c)),
    ),
    "Compensation component definition created successfully.",
    { requestId: c.get("requestId") },
  );

export const updateCompensationComponentDefinition = async (c: Context<AppContext>) =>
  ok(
    await employeesService.updateCompensationComponentDefinition(
      c.env,
      actor(c),
      requiredParam(c, "id"),
      validateCompensationDefinitionInput(await readJson(c)),
    ),
    "Compensation component definition updated successfully.",
    { requestId: c.get("requestId") },
  );

export const enableCompensationComponentDefinition = async (c: Context<AppContext>) =>
  ok(
    await employeesService.setCompensationComponentDefinitionStatus(
      c.env,
      actor(c),
      requiredParam(c, "id"),
      "active",
      await reasonFromBody(c),
    ),
    "Compensation component definition enabled successfully.",
    { requestId: c.get("requestId") },
  );

export const disableCompensationComponentDefinition = async (c: Context<AppContext>) =>
  ok(
    await employeesService.setCompensationComponentDefinitionStatus(
      c.env,
      actor(c),
      requiredParam(c, "id"),
      "inactive",
      await reasonFromBody(c),
    ),
    "Compensation component definition disabled successfully.",
    { requestId: c.get("requestId") },
  );


export const listDocuments = async (c: Context<AppContext>) =>
  ok(
    await documentsService.listEmployeeDocumentsWithCompliance(c.env, actor(c), requiredId(c)),
    "Employee documents loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const addDocument = async (c: Context<AppContext>) =>
  created(
    await documentsService.uploadDocument(c.env, actor(c), {
      ...validateDocumentUpload({ ...(await readJson(c) as Record<string, unknown>), employee_id: requiredId(c) }),
      employee_id: requiredId(c),
    }),
    "Document uploaded successfully.",
    { requestId: c.get("requestId") },
  );

export const getDocument = async (c: Context<AppContext>) =>
  ok(await documentsService.getDocument(c.env, actor(c), requiredDocumentId(c), requiredId(c)), "Document loaded successfully.", { requestId: c.get("requestId") });

export const updateDocument = async (c: Context<AppContext>) =>
  ok(await documentsService.updateDocument(c.env, actor(c), requiredDocumentId(c), validateDocumentUpdate(await readJson(c)), requiredId(c)), "Document updated successfully.", { requestId: c.get("requestId") });

export const replaceDocument = async (c: Context<AppContext>) =>
  created(
    await documentsService.replaceDocument(c.env, actor(c), requiredDocumentId(c), {
      ...validateDocumentReplace({ ...(await readJson(c) as Record<string, unknown>), employee_id: requiredId(c) }),
      employee_id: requiredId(c),
    }, requiredId(c)),
    "Document replaced successfully.",
    { requestId: c.get("requestId") },
  );

export const archiveDocument = async (c: Context<AppContext>) =>
  ok(await documentsService.archiveDocument(c.env, actor(c), requiredDocumentId(c), validateDocumentArchive(await readJson(c)), requiredId(c)), "Document archived successfully.", { requestId: c.get("requestId") });

export const documentHistory = async (c: Context<AppContext>) =>
  ok(await documentsService.getDocumentHistory(c.env, actor(c), requiredDocumentId(c), requiredId(c)), "Document history loaded successfully.", { requestId: c.get("requestId") });

export const listNotes = async (c: Context<AppContext>) =>
  ok(
    { notes: await employeesService.listNotes(c.env, actor(c), requiredId(c)) },
    "Employee notes loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const addNote = async (c: Context<AppContext>) =>
  created(
    await employeesService.addNote(
      c.env,
      actor(c),
      requiredId(c),
      validateEmployeeNoteInput(await readJson(c)),
    ),
    "Employee note added successfully.",
    { requestId: c.get("requestId") },
  );

export const listAuditLog = async (c: Context<AppContext>) =>
  ok(
    {
      audit_log: await employeesService.listAuditLog(
        c.env,
        actor(c),
        requiredId(c),
      ),
    },
    "Employee audit log loaded successfully.",
    { requestId: c.get("requestId") },
  );
