import { UniformIssuesTable } from "./UniformIssuesTable";
import type { UniformRecord } from "./uniforms.types";
import type { Pagination } from "@/types/api";

export const PendingUniformReturnsTable = (props: { rows: UniformRecord[]; loading?: boolean; pagination?: Pagination; canReturn?: boolean; onView: (row: UniformRecord) => void; onReturn: (row: UniformRecord) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => <UniformIssuesTable {...props} />;
