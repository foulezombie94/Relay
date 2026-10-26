"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, useWorkspace } from "../../providers/data-provider";
import type { StudioConfig, StudioInput } from "@/lib/domain/record-studio";
import type { LinkedRecord } from "@/lib/domain/record-links";

export type StudioData = {
  data: StudioConfig[];
  records?: LinkedRecord[];
  links?: { id: string; definition_id: string; source_id: string; target_id: string }[];
  rollups?: {
    id: string;
    name: string;
    count?: number;
    date?: string | null;
    amounts?: { currency: string; value: string }[];
  }[];
  partial?: boolean;
  schedules?: {
    config_id: string;
    next_run: string;
    paused: boolean;
    failure_count: number;
    last_error_code: string | null;
  }[];
};
export function useStudio(objectId?: string, recordId?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["rows", workspace.id, "record-studio", objectId, recordId],
    enabled: !!objectId,
    queryFn: () =>
      request<StudioData>(
        `/api/${workspace.id}/record-studio?` +
          new URLSearchParams({
            object_id: objectId!,
            ...(recordId ? { record_id: recordId } : {}),
          }),
      ),
  });
}
export function useStudioActions() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const path = `/api/${workspace.id}/record-studio`;
  const refresh = () => cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
  return {
    refresh,
    async save(value: StudioInput, previous?: StudioConfig) {
      const result = await request<{ data: StudioConfig }>(path, "PUT", {
        value,
        ...(previous ? { id: previous.id, version: previous.version } : {}),
      });
      await refresh();
      return result.data;
    },
    async remove(row: StudioConfig) {
      await request(path + `?id=${row.id}&version=${row.version}`, "DELETE");
      await refresh();
    },
    async link(
      definition: string,
      record: string,
      target: string,
      unlink = false,
      inverse_direction = false,
    ) {
      await request(path, "POST", {
        action: "link",
        definition,
        record,
        target,
        unlink,
        inverse_direction,
      });
      await refresh();
    },
    async create(configuration: string, values: Record<string, unknown>, attempt: string) {
      const result = await request<{ data: { id: string } }>(path, "POST", {
        action: "template",
        configuration,
        values,
        attempt,
      });
      await refresh();
      return result.data;
    },
  };
}
