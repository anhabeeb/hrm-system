import { IMPORT_TYPES } from "./import-export.constants";
import { NotFoundError } from "../../utils/errors";

const templates = IMPORT_TYPES.map((type) => ({
    import_type: type,
    template_key: type,
    template_name: `${type} import template`,
    format: "csv",
    status: "placeholder",
    columns: [],
  }));

export const listTemplates = () => ({ templates });

export const getTemplate = (templateKey: string) => {
  const template = templates.find((item) => item.template_key === templateKey || item.import_type === templateKey);
  if (!template) throw new NotFoundError("Import template not found.");
  return { template };
};
