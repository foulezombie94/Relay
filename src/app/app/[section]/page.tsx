import { notFound } from "next/navigation";
import { SectionView } from "@/components/layout/section-view";
import { sectionTarget } from "@/components/layout/sections";

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sectionTarget(section)) notFound();
  return <SectionView section={section} />;
}
