import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => ({ rpc }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
import {
  apiCall,
  apiFailure,
  decodeCursor,
  encodeCursor,
  generateApiKey,
  keyDigest,
  writeIdentity,
} from "./public-api";
import { openApiDocument } from "./openapi";
import { GET as listRecords, POST as createRecord } from "@/app/api/v1/records/route";

const key = generateApiKey();
const call = (
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  auth = true,
) =>
  new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { ...(auth ? { Authorization: "Bearer " + key.key } : {}), ...(init.headers ?? {}) },
  });

describe("public API", () => {
  it("generates keys whose prefix and digest are stored, never the secret", () => {
    expect(key.key).toMatch(/^zk_[A-Za-z0-9]{48}$/);
    expect(key.prefix).toBe(key.key.slice(0, 11));
    expect(key.hash).toBe(keyDigest(key.key));
    expect(key.hash).not.toContain(key.key.slice(3));
  });
  it("round-trips opaque cursors and rejects forged ones", () => {
    const cursor = encodeCursor({
      at: "2026-11-03T10:00:00.123456+00:00",
      id: "00000000-0000-4000-8000-000000000001",
    });
    expect(decodeCursor(cursor)).toEqual({
      cursor_at: "2026-11-03T10:00:00.123456+00:00",
      cursor_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(() => decodeCursor("bm9wZQ")).toThrow();
  });
  it("requires an Idempotency-Key bound to the exact request", () => {
    expect(() => writeIdentity(call("https://x.test/api/v1/records"), "op", {})).toThrow();
    const request = call("https://x.test/api/v1/records", {
      headers: { "Idempotency-Key": "attempt-0001" },
    });
    const a = writeIdentity(request, "records.create", { a: 1 });
    const b = writeIdentity(request, "records.create", { a: 2 });
    expect(a.requestId).toBe("attempt-0001");
    expect(a.digest).not.toBe(b.digest);
  });
  it("maps database results to HTTP errors with retry hints", async () => {
    rpc.mockResolvedValueOnce({ data: { error: "rate_limited", retry_after: 12 }, error: null });
    const response = apiFailure(
      await apiCall(call("https://x.test/api/v1/me"), "me").catch((e) => e),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(rpc).toHaveBeenCalledWith(
      "api_request",
      expect.objectContaining({ key_hash: key.hash }),
    );
  });
  it("rejects missing keys before reaching the database", async () => {
    rpc.mockClear();
    const response = await listRecords(
      call("https://x.test/api/v1/records?object=people", {}, false),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates bodies and returns 201 for a created record", async () => {
    rpc.mockClear();
    const invalid = await createRecord(
      call("https://x.test/api/v1/records", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "attempt-0002" },
        body: JSON.stringify({ object: "people", values: { display_name: "A", archived: true } }),
      }),
    );
    expect(invalid.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { data: { id: "r1" } }, error: null });
    const created = await createRecord(
      call("https://x.test/api/v1/records", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "attempt-0003" },
        body: JSON.stringify({ object: "people", values: { display_name: "Alice" } }),
      }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ data: { id: "r1" } });
  });
  it("describes every route in an OpenAPI 3 document", () => {
    const doc = openApiDocument("https://crm.example");
    expect(doc.openapi).toBe("3.0.3");
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/records", "/records/{id}", "/tasks", "/notes", "/webhooks", "/me"]),
    );
    expect(JSON.stringify(doc)).toContain("Idempotency-Key");
  });
});
