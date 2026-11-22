import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "160.79.104.10", family: 4 }],
}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => ({ rpc }) }));
import {
  clientId,
  clientIdUrl,
  documentRedirects,
  privateAddress,
  resolveClientId,
} from "./client-document";

const claudeCode = "https://claude.ai/oauth/claude-code-client-metadata";
const declared = ["http://localhost/callback", "http://127.0.0.1/callback"];

describe("OAuth Client ID Metadata Documents", () => {
  it("accepts only HTTPS document URLs on the default port, without credentials or IPs", () => {
    expect(clientIdUrl.safeParse("https://client.example.com/oauth/client.json").success).toBe(
      true,
    );
    for (const bad of [
      "http://client.example.com/c.json",
      "https://client.example.com",
      "https://client.example.com:8443/c.json",
      "https://user:pass@client.example.com/c.json",
      "https://127.0.0.1/c.json",
      "https://[::1]/c.json",
      "https://client.example.com/c.json#frag",
    ])
      expect(clientIdUrl.safeParse(bad).success).toBe(false);
    expect(clientId.safeParse("cf967873-7e4e-4d9a-b54b-8797f2583213").success).toBe(true);
  });
  it("treats loopback, private, link-local, CGNAT and mapped addresses as private", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ])
      expect(privateAddress(address)).toBe(true);
    for (const address of ["93.184.216.34", "2606:4700:4700::1111"])
      expect(privateAddress(address)).toBe(false);
  });
  it("returns a registered client UUID unchanged, without any network or database call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const id = "cf967873-7e4e-4d9a-b54b-8797f2583213";
    await expect(resolveClientId(id, "authorize")).resolves.toBe(id);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("admits the port a native client picks for a port-less loopback redirect", () => {
    expect(documentRedirects(declared, "http://localhost:53682/callback")).toEqual([
      "http://localhost:53682/callback",
      ...declared,
    ]);
    expect(documentRedirects(declared, "http://127.0.0.1:4000/callback")[0]).toBe(
      "http://127.0.0.1:4000/callback",
    );
    for (const other of [
      "http://localhost:53682/other",
      "http://127.0.0.1:53682/callback/extra",
      "https://localhost:53682/callback",
      "http://evil.example:53682/callback",
      "http://[::1]:53682/callback",
    ])
      expect(documentRedirects(declared, other)).toEqual(declared);
    expect(
      documentRedirects(["https://app.example.com/cb"], "https://app.example.com:8443/cb"),
    ).toEqual(["https://app.example.com/cb"]);
  });
  it("accepts the Claude Code metadata document and stores the requested loopback port", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          client_id: claudeCode,
          client_name: "Claude Code",
          redirect_uris: declared,
          grant_types: ["authorization_code", "refresh_token"],
          token_endpoint_auth_method: "none",
        }),
      ),
    );
    rpc.mockResolvedValue({ data: { client_id: "cf967873-7e4e-4d9a-b54b-8797f2583213" } });
    await expect(
      resolveClientId(claudeCode, "authorize", "key", "http://localhost:61234/callback"),
    ).resolves.toBe("cf967873-7e4e-4d9a-b54b-8797f2583213");
    expect(rpc).toHaveBeenCalledWith("mcp_client_document", {
      operation: "upsert",
      payload: {
        url: claudeCode,
        rate_limit_key: "key",
        client_name: "Claude Code",
        redirect_uris: ["http://localhost:61234/callback", ...declared],
      },
    });
    fetchSpy.mockRestore();
  });
});
