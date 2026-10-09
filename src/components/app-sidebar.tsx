"use client";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./data-provider";
import { browserDb } from "@/lib/supabase/client";
import { AppSidebarView } from "./app-sidebar-view";
export function AppSidebar() {
  const context = useWorkspace();
  const path = usePathname();
  return (
    <AppSidebarView
      {...context}
      path={path}
      onSignOut={async () => {
        const { error } = await browserDb().auth.signOut({ scope: "local" });
        if (!error) window.location.replace("/login");
      }}
    />
  );
}
