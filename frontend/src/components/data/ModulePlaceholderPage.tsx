import { Eye } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { PaginationBar } from "@/components/data/PaginationBar";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { TableToolbar } from "@/components/data/TableToolbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TableColumn } from "@/types/common";

export interface PlaceholderRow {
  id: string;
  [key: string]: string | number | boolean;
}

export const ModulePlaceholderPage = ({
  title: _title,
  description: _description,
  tableTitle,
  tableDescription,
  columns,
  rows,
  createLabel,
}: {
  title: string;
  description: string;
  tableTitle: string;
  tableDescription: string;
  columns: TableColumn<PlaceholderRow>[];
  rows: PlaceholderRow[];
  createLabel?: string;
}) => {
  void _title;
  void _description;

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        <TableToolbar
          title={tableTitle}
          description={tableDescription}
          onSearch={() => undefined}
          createLabel={createLabel}
          onCreate={() => undefined}
          onExport={() => undefined}
          filters={
            <FilterBar>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="locked">Locked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Outlet</Label>
                <Input placeholder="Outlet filter" />
              </div>
              <div className="space-y-2">
                <Label>Date range</Label>
                <Input placeholder="Future date picker" />
              </div>
            </FilterBar>
          }
        />
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          emptyTitle="No placeholder rows"
          emptyDescription="The production module UI will connect to live API data in a future prompt."
          rowActions={() => (
            <RowActions
              actions={[
                { key: "view", label: "View details" },
                { key: "edit" },
                { key: "more" },
              ]}
            />
          )}
        />
        <PaginationBar page={1} pageSize={25} total={rows.length} />
        <div className="flex items-start gap-2 rounded-lg border bg-blue-50 p-4 text-sm text-blue-900">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This is a table-first placeholder. The business workflow for this module will be implemented in a future frontend prompt.</p>
        </div>
      </div>
    </div>
  );
};

export const statusCell = (key: string) => (row: PlaceholderRow) => <StatusBadge status={String(row[key])} />;
