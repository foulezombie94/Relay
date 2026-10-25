"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CrmRecord } from "@/lib/domain/types";
import { request, useWorkspace } from "../providers/data-provider";
import { AssistantComposerView } from "./composer-view";
export type { RecordContext } from "./composer-view";
type Props = Omit<
  ComponentProps<typeof AssistantComposerView>,
  "contextOpen" | "setContextOpen" | "recordSearch" | "setRecordSearch" | "records"
>;
export function AssistantComposer(props: Props) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  const records = useQuery({
    queryKey: ["assistant-context", workspace.id, query],
    enabled: open,
    queryFn: () =>
      request<{ data: CrmRecord[] }>(
        "/api/" + workspace.id + "/records?size=30&q=" + encodeURIComponent(query),
      ),
  });
  return (
    <AssistantComposerView
      {...props}
      contextOpen={open}
      setContextOpen={setOpen}
      recordSearch={search}
      setRecordSearch={setSearch}
      records={{
        loading: records.isPending,
        error: records.error?.message,
        data: records.error ? [] : (records.data?.data ?? []),
      }}
    />
  );
}
