"use client";
import { AppearanceProvider } from "../providers/appearance-provider";
import { PortalDirectory } from "./directory";
import { PortalSpace } from "./space";
export function PortalList({ userId }: { userId: string }) {
  return (
    <AppearanceProvider user={userId}>
      <PortalDirectory />
    </AppearanceProvider>
  );
}
export function PortalClient({ id, userId }: { id: string; userId: string }) {
  return (
    <AppearanceProvider user={userId}>
      <PortalSpace key={id} id={id} />
    </AppearanceProvider>
  );
}
