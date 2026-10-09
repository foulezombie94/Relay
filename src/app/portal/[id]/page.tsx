import { db } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PortalClient } from "@/components/portal/client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return <PortalClient id={(await params).id} />;
}
