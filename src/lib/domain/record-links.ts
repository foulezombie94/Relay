export type LinkedRecord = {
  id: string;
  object_id: string;
  display_name: string;
  domain: string | null;
  email: string | null;
};
export type RecordLink = { id: string; source_id: string; target_id: string; label: string };
export type RecordLinks = { links: RecordLink[]; records: LinkedRecord[]; partial: boolean };
export function linksForRecord(data: RecordLinks | undefined, id: string) {
  return (data?.links ?? []).flatMap((link) => {
    const otherId =
      link.source_id === id ? link.target_id : link.target_id === id ? link.source_id : null;
    const record = data?.records.find((row) => row.id === otherId);
    return record ? [{ link, record }] : [];
  });
}
