import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import "@/components/ui/workspace-ui.css";
export const metadata: Metadata = {
  title: "Zyliad · Votre contexte, vos prochaines actions",
  description: "Le CRM qui relie vos clients, vos échanges et vos engagements.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
