"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, useWorkspace } from "../providers/data-provider";
import { SearchDialogView } from "./search-dialog-view";
import { commandEntries, searchEntries, type SearchResponse } from "./search-model";
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { workspace, user, objects } = useWorkspace();
  return (
    <SearchSession
      key={workspace.id + ":" + user.id}
      workspaceId={workspace.id}
      userId={user.id}
      name={workspace.name}
      objects={objects}
      onClose={onClose}
    />
  );
}
function SearchSession({
  workspaceId,
  userId,
  name,
  objects,
  onClose,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  objects: { id: string; slug: string; standard: boolean }[];
  onClose: () => void;
}) {
  const [term, setTerm] = useState(""),
    [debounced, setDebounced] = useState(""),
    [scope, setScope] = useState("all");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);
  const query = useQuery({
    queryKey: ["rows", workspaceId, "global-search-dialog", userId, debounced, scope],
    enabled: debounced.length >= 2,
    queryFn: () =>
      request<SearchResponse>(
        `/api/${workspaceId}/search?${new URLSearchParams({ q: debounced, scope })}`,
      ),
  });
  const searching = term.trim().length >= 2;
  const pending = searching && (debounced !== term.trim() || query.isPending);
  // Actions and pages first (filtered as you type), then the records found.
  const results =
    searching && !query.error && query.data && debounced === term.trim()
      ? searchEntries(query.data, objects)
      : [];
  const entries = [...commandEntries(term), ...results];
  return (
    <SearchDialogView
      open
      onClose={onClose}
      workspaceName={name}
      term={term}
      onTerm={setTerm}
      scope={scope}
      onScope={setScope}
      entries={entries}
      loading={pending}
      error={searching && debounced === term.trim() ? query.error?.message : undefined}
    />
  );
}
