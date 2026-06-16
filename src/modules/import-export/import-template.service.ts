import { IMPORT_TYPES } from "./import-export.constants";
import { NotFoundError } from "../../utils/errors";

const templates = IMPORT_TYPES.map((type) => ({
    import_type: type,
    template_key: type,
    template_name: "Employees Excel import template",
    template_type: type,
    format: "xlsx",
    status: "available",
    description: "Create employee records from an Excel workbook. Required columns: employee_no, full_name.",
    columns: [
      { key: "employee_no", label: "Employee No", required: true },
      { key: "full_name", label: "Full Name", required: true },
      { key: "employee_type", label: "Employee Type", required: false },
      { key: "joined_at", label: "Joined Date", required: false },
      { key: "phone", label: "Phone", required: false },
      { key: "nationality", label: "Nationality", required: false },
    ],
  }));

export const listTemplates = () => ({ templates });

export const getTemplate = (templateKey: string) => {
  const template = templates.find((item) => item.template_key === templateKey || item.import_type === templateKey);
  if (!template) throw new NotFoundError("Import template not found.");
  return { template };
};
