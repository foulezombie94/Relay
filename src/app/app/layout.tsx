import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { AppProvider } from "@/components/providers/data-provider";
import { Shell } from "@/components/layout/shell";
import { assertAuthAvailable } from "@/lib/supabase/session";
export default async function AppLayout({ children }: { children: ReactNode }) {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  assertAuthAvailable(error);
  if (error || !user) redirect("/login");
  const jar = await cookies();
  const defaultOpen = jar.get("relay_sidebar_open")?.value !== "false";
  return (
    <AppProvider userId={user.id}>
      <Shell defaultOpen={defaultOpen}>{children}</Shell>
    </AppProvider>
  );
}
