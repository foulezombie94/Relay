import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: mocks.adminDb }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
import { GET, POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const params = (key: string) => ({ params: Promise.resolve({ key }) });
const request = (key: string, method = "GET", body?: unknown) =>
  new NextRequest("https://relay.example/api/forms/" + encodeURIComponent(key), {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

beforeEach(() => vi.resetAllMocks());

describe("public form link validation", () => {
  it.each(["qa-nonexistent-20261027", "", "not-a-uuid", id + "' OR 1=1"])(
    "rejects an invalid link before accessing privileged configuration: %s",
    async (key) => {
      const response = await GET(request(key), params(key));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Ce lien de formulaire est invalide ou n’est plus disponible.",
      });
      expect(mocks.adminDb).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid submission link before accessing privileged configuration", async () => {
    const key = "invalid-link";
    const response = await POST(request(key, "POST", { attempt: id, answers: {} }), params(key));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Ce lien de formulaire est invalide ou n’est plus disponible.",
    });
    expect(mocks.adminDb).not.toHaveBeenCalled();
  });

  it("still checks publication for a well-formed key and returns no configuration for a missing form", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const from = vi.fn().mockReturnValue(query);
    mocks.adminDb.mockReturnValue({ from });
    const response = await GET(request(id), params(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Formulaire indisponible." });
    expect(from).toHaveBeenCalledWith("record_configs");
    expect(query.eq).toHaveBeenCalledWith("share_key", id);
    expect(query.contains).toHaveBeenCalledWith("config", { published: true });
  });
});

describe("public form source admission", () => {
  function published(rpc: ReturnType<typeof vi.fn>) {
    const config = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id,
          workspace_id: id,
          object_id: id,
          name: "Contact",
          config: {
            published: true,
            questions: [
              { id, property: "display_name", label: "Nom", type: "text", required: true },
            ],
          },
          created_by: id,
        },
        error: null,
      }),
    };
    const member = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
    };
    const from = vi.fn((table: string) => (table === "memberships" ? member : config));
    mocks.adminDb.mockReturnValue({ from, rpc });
  }

  it("refuses an over-budget source before writing any record", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    published(rpc);
    const response = await POST(
      request(id, "POST", { attempt: id, answers: { [id]: "Ada" } }),
      params(id),
    );
    expect(response.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_form_admit", {
      source_key: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("fails closed in production without a trusted platform address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-server-key");
    try {
      const rpc = vi.fn();
      published(rpc);
      const response = await POST(
        request(id, "POST", { attempt: id, answers: { [id]: "Ada" } }),
        params(id),
      );
      expect(response.status).toBe(503);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
