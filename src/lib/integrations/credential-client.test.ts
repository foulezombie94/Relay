import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => ({ rpc: mocks.rpc }) }));
import { credentialClient } from "./credential-client";

beforeEach(() => mocks.rpc.mockResolvedValue({ data: null, error: null }));
afterEach(() => vi.clearAllMocks());
it("uses the verified session identity, never a caller-supplied subject", async () => {
  const originalRpc = vi.fn();
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null }),
    },
    rpc: originalRpc,
  } as unknown as SupabaseClient;
  const credentials = await credentialClient(client);
  await credentials.rpc("integration_get", { w: "workspace", p: "gmail", subject: "forged-user" });
  expect(originalRpc).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith(
    "integration_server",
    expect.objectContaining({
      subject: "verified-user",
      w: "workspace",
      p: "gmail",
      operation: "integration_get",
    }),
  );
});
it("rejects absent or invalid sessions before privileged credential access", async () => {
  for (const error of [null, { status: 401, message: "invalid jwt" }]) {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }) },
    } as unknown as SupabaseClient;
    await expect(credentialClient(client)).rejects.toThrow("Connexion requise");
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("preserves the server-created worker adapter and its scoped RPC", async () => {
  const worker = { rpc: vi.fn() } as unknown as SupabaseClient;
  expect(await credentialClient(worker)).toBe(worker);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects operations outside the credential contract", async () => {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null }),
    },
  } as unknown as SupabaseClient;
  const credentials = await credentialClient(client);
  expect(() => credentials.rpc("execute_anything", { w: "workspace", p: "gmail" })).toThrow(
    "Opération de credentials invalide",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
