import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SetupGuideGate } from "@/features/setup-guide/SetupGuideGate";
import { SetupGuideOverlay } from "@/features/setup-guide/SetupGuideOverlay";

const SIDEBAR_STORAGE_KEY = "hrm.sidebar.collapsed";

export const AppShell = () => {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      <SetupGuideGate />
      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <SetupGuideOverlay />
    </div>
  );
};
