"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWorkspace } from "../providers/data-provider";
import { browserDb } from "@/lib/supabase/client";
import { AppSidebarView } from "./app-sidebar-view";
import { SearchDialog } from "../search/search-dialog";
export function AppSidebar() {
  const context = useWorkspace();
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <>
      <AppSidebarView
        {...context}
        path={path}
        onSearch={() => setSearchOpen(true)}
        onSignOut={async () => {
          const { error } = await browserDb().auth.signOut({ scope: "local" });
          if (!error) window.location.replace("/login");
        }}
      />
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </>
  );
}
