import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "user-1", user: "Aisha Admin", email: "aisha@example.com", roles: "Admin", status: "active", last_login: "2026-06-02" },
  { id: "user-2", user: "Hassan HR", email: "hassan@example.com", roles: "HR Officer", status: "inactive", last_login: "2026-05-28" },
];

export const UsersAccessPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Users & Access"
    description="User accounts, roles, permissions, and access controls will be implemented in a future prompt."
    tableTitle="User access register"
    tableDescription="A table-first foundation for account and role review."
    rows={rows}
    columns={[
      { key: "user", header: "User" },
      { key: "email", header: "Email" },
      { key: "roles", header: "Roles" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "last_login", header: "Last Login" },
    ]}
  />
);
