import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { connection, unseal, seal } from "./oauth";
import { services } from "./services";
beforeEach(() => {
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const token = () => ({
  access_token: "old-access",
  refresh_token: "old-refresh",
  scope: services.gmail.scopes.join(" "),
  email: "fixture@example.invalid",
  expires_at: 0,
});
it("retains a refresh token when a renewal returns only an access token", async () => {
  let persisted = "";
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "integration_get")
      return {
        data: { id: "fixture", encrypted_tokens: seal(token()), revision: 1 },
        error: null,
      };
    if (name === "integration_refresh_claim") return { data: true, error: null };
    if (name === "integration_refresh_finish") {
      if (args.encrypted) persisted = String(args.encrypted);
      return { data: !!args.encrypted, error: null };
    }
    throw Error(name);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "new-access", expires_in: 3600 })),
  );
  const result = await connection({ rpc } as unknown as SupabaseClient, "workspace", "gmail");
  expect(result.tokens.refresh_token).toBe("old-refresh");
  expect(unseal<{ access_token: string }>(persisted).access_token).toBe("new-access");
  expect(
    rpc.mock.calls.filter((c) => c[0] === "integration_refresh_finish").at(-1)?.[1]
      .expected_revision,
  ).toBe(1);
});
it("does not recreate tokens after disconnection during renewal", async () => {
  let reads = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === "integration_get")
      return {
        data:
          reads++ === 0 ? { id: "fixture", encrypted_tokens: seal(token()), revision: 1 } : null,
        error: null,
      };
    return { data: name === "integration_refresh_claim", error: null };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "new-access", expires_in: 3600 })),
  );
  await expect(
    connection({ rpc } as unknown as SupabaseClient, "workspace", "gmail"),
  ).rejects.toThrow("Connectez ce service");
  expect(rpc.mock.calls.some((c) => c[0] === "integration_save")).toBe(false);
});
