import type { AuthActor } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { getMissingDocuments } from "../documents/document-expiry.service";
import * as repository from "./reports.repository";
import type { ReportFilters } from "./reports.types";
import { canViewSensitiveDocuments, maskSensitiveValue, sanitizeDocumentReportRow } from "./report-permission.service";

const documentScope = (context: AuthActor) => ({ isSuperAdmin: context.isSuperAdmin, outletIds: context.outletIds });

const buildMissingDocumentReport = async (env: Env, context: AuthActor, filters: ReportFilters) => {
  const rows = await getMissingDocuments(env, context.companyId, documentScope(context), filters.outlet_id);
  const filtered = rows.filter((row) => {
    if (filters.employee_id && row.employee_id !== filters.employee_id) return false;
    if (filters.employee_type && row.employee_type !== filters.employee_type) return false;
    if (filters.document_type && row.document_type !== filters.document_type) return false;
    return true;
  });
  const canViewSensitive = canViewSensitiveDocuments(context);
  const safeRows = filtered.map((row) => {
    const safe = sanitizeDocumentReportRow(row, canViewSensitive);
    if ((safe.is_sensitive === 1 || safe.is_sensitive === true) && !canViewSensitive) {
      safe.document_category_name = "Sensitive document";
    }
    return safe;
  });
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 25;
  const offset = (page - 1) * pageSize;
  const paged = safeRows.slice(offset, offset + pageSize);
  return {
    rows: paged,
    summary: {
      total_missing: filtered.length,
      employees_with_missing_documents: new Set(filtered.map((row) => row.employee_id)).size,
    },
    pagination: {
      page,
      page_size: pageSize,
      total: filtered.length,
      total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
    },
  };
};

export const buildReport = async (env: Env, context: AuthActor, reportKey: string, filters: ReportFilters) => {
  switch (reportKey) {
    case "employee_summary":
      return { report_key: reportKey, rows: [], ...(await repository.employeeSummary(env, context, filters)) };
    case "attendance_summary":
      return { report_key: reportKey, rows: [], ...(await repository.attendanceSummary(env, context, filters)) };
    case "leave_summary":
      return { report_key: reportKey, rows: [], ...(await repository.leaveSummary(env, context, filters)) };
    case "payroll_summary":
      return { report_key: reportKey, rows: [], ...(await repository.payrollSummary(env, context, filters)) };
    case "asset_summary": {
      const outlet = repository.outletClause(context, "COALESCE(aa.outlet_id, e.primary_outlet_id, a.outlet_id)", filters.outlet_id);
      const row = await repository.simpleCount(env, `SELECT COUNT(DISTINCT a.id) AS total_assets,
        COUNT(DISTINCT CASE WHEN a.status = 'available' THEN a.id END) AS available_assets,
        COUNT(DISTINCT CASE WHEN a.status IN ('assigned', 'issued') THEN a.id END) AS issued_assets,
        COUNT(DISTINCT CASE WHEN a.status = 'lost' THEN a.id END) AS lost_assets,
        COUNT(DISTINCT CASE WHEN a.status = 'damaged' THEN a.id END) AS damaged_assets,
        COUNT(DISTINCT CASE WHEN aa.status IN ('issued', 'lost', 'damaged') AND aa.returned_date IS NULL THEN aa.id END) AS pending_return_count,
        COUNT(DISTINCT CASE WHEN ad.status = 'pending' THEN ad.id END) AS pending_deduction_count,
        COALESCE(SUM(CASE WHEN ad.status = 'approved' THEN ad.amount ELSE 0 END), 0) AS approved_deduction_amount
        FROM assets a
        LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.company_id = a.company_id AND aa.returned_date IS NULL
        LEFT JOIN employees e ON e.id = aa.employee_id AND e.company_id = aa.company_id
        LEFT JOIN asset_deductions ad ON ad.asset_assignment_id = aa.id AND ad.company_id = aa.company_id
        WHERE a.company_id = ? AND a.deleted_at IS NULL${outlet.sql}`, [context.companyId, ...outlet.values]);
      const byOutlet = await repository.listRows(env, `SELECT COALESCE(a.outlet_id, e.primary_outlet_id) AS outlet_id, COUNT(DISTINCT a.id) AS total
        FROM assets a
        LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.company_id = a.company_id AND aa.returned_date IS NULL
        LEFT JOIN employees e ON e.id = aa.employee_id AND e.company_id = aa.company_id
        WHERE a.company_id = ? AND a.deleted_at IS NULL${outlet.sql}
        GROUP BY COALESCE(a.outlet_id, e.primary_outlet_id)`, [context.companyId, ...outlet.values]);
      const byAssetType = await repository.listRows(env, `SELECT a.asset_type, COUNT(DISTINCT a.id) AS total
        FROM assets a
        LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.company_id = a.company_id AND aa.returned_date IS NULL
        LEFT JOIN employees e ON e.id = aa.employee_id AND e.company_id = aa.company_id
        WHERE a.company_id = ? AND a.deleted_at IS NULL${outlet.sql}
        GROUP BY a.asset_type`, [context.companyId, ...outlet.values]);
      return { report_key: reportKey, rows: [], summary: { ...(row ?? {}), by_outlet: byOutlet, by_asset_type: byAssetType } };
    }
    case "document_summary": {
      const outlet = repository.outletClause(context, "e.primary_outlet_id", filters.outlet_id);
      const row = await repository.simpleCount(env, `SELECT COUNT(*) AS total_documents,
        SUM(CASE WHEN d.status = 'valid' THEN 1 ELSE 0 END) AS valid_documents,
        SUM(CASE WHEN d.status = 'expired' THEN 1 ELSE 0 END) AS expired_documents,
        SUM(CASE WHEN d.expiry_date IS NOT NULL AND d.expiry_date <= date('now', '+30 day') THEN 1 ELSE 0 END) AS expiring_soon_count,
        SUM(CASE WHEN d.is_sensitive = 1 THEN 1 ELSE 0 END) AS sensitive_documents
        FROM employee_documents d
        JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
        WHERE d.company_id = ? AND d.deleted_at IS NULL${outlet.sql}`, [context.companyId, ...outlet.values]);
      const missing = await buildMissingDocumentReport(env, context, filters);
      const byDocumentType = await repository.listRows(env, `SELECT d.document_type, COUNT(*) AS total
        FROM employee_documents d JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
        WHERE d.company_id = ? AND d.deleted_at IS NULL${outlet.sql}
        GROUP BY d.document_type`, [context.companyId, ...outlet.values]);
      const byOutlet = await repository.listRows(env, `SELECT e.primary_outlet_id AS outlet_id, COUNT(*) AS total
        FROM employee_documents d JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
        WHERE d.company_id = ? AND d.deleted_at IS NULL${outlet.sql}
        GROUP BY e.primary_outlet_id`, [context.companyId, ...outlet.values]);
      return { report_key: reportKey, rows: [], summary: { ...(row ?? {}), missing_required_count: missing.summary.total_missing, by_document_type: byDocumentType, by_outlet: byOutlet } };
    }
    case "expiring_documents": {
      const outlet = repository.outletClause(context, "e.primary_outlet_id", filters.outlet_id);
      const rows = await repository.listRows<Record<string, unknown>>(env, `SELECT d.id, d.employee_id, e.employee_code, e.full_name AS employee_name,
          e.primary_outlet_id AS outlet_id, d.document_type, d.file_name, d.expiry_date, d.status, d.is_sensitive
        FROM employee_documents d JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
        WHERE d.company_id = ? AND d.deleted_at IS NULL AND d.expiry_date IS NOT NULL
          AND d.expiry_date <= date('now', '+' || ? || ' day')${outlet.sql}`, [context.companyId, filters.days ?? 30, ...outlet.values]);
      return { report_key: reportKey, rows: rows.map((row) => sanitizeDocumentReportRow(row, canViewSensitiveDocuments(context))), summary: { total: rows.length } };
    }
    case "missing_documents":
      return { report_key: reportKey, ...(await buildMissingDocumentReport(env, context, filters)) };
    case "audit_activity": {
      const outlet = repository.outletClause(context, "outlet_id", filters.outlet_id);
      const rows = await repository.listRows(env, `SELECT id, outlet_id, module, action, severity, entity_type, entity_id, actor_user_id, old_value_json, new_value_json, reason, created_at
        FROM audit_logs WHERE company_id = ?${outlet.sql} ORDER BY created_at DESC LIMIT 100`, [context.companyId, ...outlet.values]);
      return { report_key: reportKey, rows: maskSensitiveValue(rows), summary: { total: rows.length } };
    }
    case "device_health": {
      const outlet = repository.outletClause(context, "d.outlet_id", filters.outlet_id);
      const rows = await repository.listRows(env, `SELECT d.id, d.device_name, d.device_type, d.status, d.outlet_id, d.last_seen_at
        FROM devices d WHERE d.company_id = ?${outlet.sql} ORDER BY d.last_seen_at DESC LIMIT 100`, [context.companyId, ...outlet.values]);
      return { report_key: reportKey, rows, summary: { total: rows.length } };
    }
    case "sync_status": {
      const outlet = repository.outletClause(context, "outlet_id", filters.outlet_id);
      const row = await repository.simpleCount(env, `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_batches,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_batches
        FROM sync_batches WHERE company_id = ?${outlet.sql}`, [context.companyId, ...outlet.values]);
      return { report_key: reportKey, rows: [], summary: row ?? {} };
    }
    default:
      throw new AppError("Please select a valid report.", "REPORT_NOT_FOUND", 404);
  }
};
