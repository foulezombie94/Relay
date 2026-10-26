import { PublicForm } from "./public-form";
export const metadata = { title: "Formulaire · Zyliad", robots: { index: false, follow: false } };
export default async function FormPage({ params }: { params: Promise<{ key: string }> }) {
  return <PublicForm shareKey={(await params).key} />;
}
