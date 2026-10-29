"use client";
import { useEffect, useRef, useState } from "react";
import { request, RequestError } from "../providers/data-provider";
import {
  parseSkillManifest,
  type SkillDetail,
  type SkillManifest,
} from "@/lib/domain/agent-skills";
type Draft = { manifest: SkillManifest; visibility: "private" | "workspace" };
type Props = {
  workspace: string;
  id: string;
  value: Draft | null;
  server?: SkillDetail;
  enabled: boolean;
  blocked: boolean;
  onSaved: (detail: SkillDetail) => void;
};
function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}
export function useSkillAutosave(props: Props) {
  const [status, setStatus] = useState<
      "saved" | "pending" | "saving" | "error" | "conflict" | "invalid"
    >("saved"),
    [error, setError] = useState("");
  const current = useRef(props);
  current.current = props;
  const identity = useRef(""),
    revision = useRef(0),
    baseline = useRef(""),
    latestDetail = useRef<SkillDetail | null>(null),
    flight = useRef<Promise<SkillDetail | null> | null>(null),
    conflict = useRef(false);
  const serial = props.value ? draftFingerprint(props.value) : "";
  useEffect(() => {
    const key = props.workspace + ":" + props.id;
    if (identity.current !== key) {
      identity.current = key;
      revision.current = props.server?.skill.revision ?? 0;
      baseline.current = props.server?.draft
        ? draftFingerprint({
            manifest: props.server.draft,
            visibility: props.server.skill.visibility,
          })
        : "";
      latestDetail.current = props.server ?? null;
      conflict.current = false;
      setStatus("saved");
      setError("");
      return;
    }
    if (!props.server) return;
    if (!revision.current) {
      revision.current = props.server.skill.revision;
      baseline.current = props.server.draft
        ? draftFingerprint({
            manifest: props.server.draft,
            visibility: props.server.skill.visibility,
          })
        : "";
      latestDetail.current = props.server;
    } else if (props.server.skill.revision !== revision.current) {
      if (current.current.value && draftFingerprint(current.current.value) !== baseline.current) {
        conflict.current = true;
        setStatus("conflict");
        setError(
          "Cette méthode a été modifiée ailleurs. Votre saisie est conservée ; rechargez la version serveur avant de reprendre.",
        );
      } else {
        revision.current = props.server.skill.revision;
        latestDetail.current = props.server;
        baseline.current = props.server.draft
          ? draftFingerprint({
              manifest: props.server.draft,
              visibility: props.server.skill.visibility,
            })
          : "";
      }
    }
  }, [props.workspace, props.id, props.server]);
  async function saveNow(): Promise<SkillDetail | null> {
    if (flight.current) {
      await flight.current;
      if (conflict.current) return null;
      const now = current.current;
      if (now.value && draftFingerprint(now.value) !== baseline.current) return saveNow();
      return latestDetail.current;
    }
    const snapshot = current.current;
    if (
      !snapshot.enabled ||
      !snapshot.value ||
      snapshot.blocked ||
      !revision.current ||
      conflict.current
    )
      return null;
    const json = draftFingerprint(snapshot.value);
    if (json === baseline.current) {
      setStatus("saved");
      snapshot.onSaved(latestDetail.current!);
      return latestDetail.current;
    }
    try {
      parseSkillManifest(snapshot.value.manifest);
    } catch (reason) {
      setStatus("invalid");
      setError(reason instanceof Error ? reason.message : "Complétez les champs de la méthode.");
      return null;
    }
    const key = identity.current;
    setStatus("saving");
    setError("");
    const pending = (async () => {
      try {
        const response = await request<{ data: SkillDetail }>(
          `/api/${snapshot.workspace}/skills`,
          "POST",
          {
            action: "save",
            id: snapshot.id,
            revision: revision.current,
            manifest: snapshot.value!.manifest,
            visibility: snapshot.value!.visibility,
          },
        );
        if (key !== identity.current) return null;
        revision.current = response.data.skill.revision;
        baseline.current = json;
        latestDetail.current = response.data;
        if (current.current.value && draftFingerprint(current.current.value) === json) {
          setStatus("saved");
          current.current.onSaved(response.data);
        } else setStatus("pending");
        return response.data;
      } catch (reason) {
        if (key === identity.current) {
          const collision = reason instanceof RequestError && reason.status === 409;
          conflict.current = collision;
          setStatus(collision ? "conflict" : "error");
          setError(
            reason instanceof Error
              ? reason.message
              : "Enregistrement impossible. Votre saisie est conservée.",
          );
        }
        return null;
      } finally {
        flight.current = null;
      }
    })();
    flight.current = pending;
    return pending;
  }
  const saver = useRef(saveNow);
  saver.current = saveNow;
  useEffect(() => {
    if (
      !props.enabled ||
      !props.value ||
      props.blocked ||
      !revision.current ||
      conflict.current ||
      serial === baseline.current
    )
      return;
    if (status === "error" || status === "conflict" || status === "invalid") return;
    if (status !== "saving") setStatus("pending");
    const timer = setTimeout(() => void saver.current(), 1000);
    return () => clearTimeout(timer);
  }, [serial, props.enabled, props.blocked, status]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const now = current.current;
      if (now.enabled && now.value && draftFingerprint(now.value) !== baseline.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function retry() {
    if (conflict.current) return;
    setStatus("pending");
    setError("");
    void saveNow();
  }
  function edited() {
    if (!conflict.current && status !== "saving") {
      setStatus("pending");
      setError("");
    }
  }
  function reload(fresh?: SkillDetail) {
    const detail = fresh ?? current.current.server;
    if (!detail) return;
    conflict.current = false;
    revision.current = detail.skill.revision;
    baseline.current = detail.draft
      ? draftFingerprint({ manifest: detail.draft, visibility: detail.skill.visibility })
      : "";
    latestDetail.current = detail;
    setStatus("saved");
    setError("");
    current.current.onSaved(detail);
  }
  return { status, error, saveNow, retry, edited, reload };
}
