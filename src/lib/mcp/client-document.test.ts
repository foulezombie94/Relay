import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Simulated network: DNS answers and the HTTPS server are controlled by each test, and
// every connection records the address it was pinned to.
const net = vi.hoisted(() => ({
  addresses: [] as { address: string; family: number }[],
  lookups: 0,
  status: 200,
  body: "",
  connections: [] as string[],
}));
vi.mock("node:dns/promises", () => ({
  lookup: async () => {
    net.lookups += 1;
    return net.addresses;
  },
}));
vi.mock("node:https", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  type Lookup = (h: string, o: object, cb: (e: null, address: string) => void) => void;
  return {
    request: (url: URL, options: { lookup: Lookup }, onResponse: (res: unknown) => void) => {
      const req = Object.assign(new EventEmitter(), {
        destroy(error?: Error) {
          if (error) req.emit("error", error);
          req.emit("close");
        },
        end() {
          options.lookup(url.hostname, {}, (_error, address) => {
            net.connections.push(address);
            const res = Object.assign(Readable.from([Buffer.from(net.body)]), {
              statusCode: net.status,
            });
            res.on("end", () => req.emit("close"));
            onResponse(res);
          });
        },
      });
      return req;
    },
  };
});
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => ({ rpc }) }));
import { clientId, clientIdUrl, documentRedirects, resolveClientId } from "./client-document";

const claudeCode = "https://claude.ai/oauth/claude-code-client-metadata";
const declared = ["http://localhost/callback", "http://127.0.0.1/callback"];
const clientUuid = "cf967873-7e4e-4d9a-b54b-8797f2583213";
const serve = (document: unknown, status = 200) => {
  net.status = status;
  net.body = typeof document === "string" ? document : JSON.stringify(document);
};

beforeEach(() => {
  net.addresses = [{ address: "160.79.104.10", family: 4 }];
  net.lookups = 0;
  net.connections = [];
  serve({
    client_id: claudeCode,
    client_name: "Claude Code",
    redirect_uris: declared,
    token_endpoint_auth_method: "none",
  });
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { client_id: clientUuid } });
});

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
    expect(clientId.safeParse(clientUuid).success).toBe(true);
  });
  it("never connects when the host resolves to a private, reserved or translated address", async () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      // Ranges the previous CIMD guard let through (audit ZY-04).
      "192.0.0.10",
      "198.51.100.7",
      "203.0.113.9",
      "64:ff9b::a9fe:a9fe",
      "2002:a9fe:a9fe::1",
      "2001:0:4136:e378::1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      net.addresses = [{ address, family: address.includes(":") ? 6 : 4 }];
      await expect(resolveClientId(claudeCode, "authorize"), address).rejects.toMatchObject({
        status: 400,
        code: "invalid_client",
      });
    }
    // One private answer among public ones is enough to refuse.
    net.addresses = [
      { address: "160.79.104.10", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    await expect(resolveClientId(claudeCode, "authorize")).rejects.toMatchObject({
      code: "invalid_client",
    });
    expect(net.connections).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses internal host names before any DNS lookup", async () => {
    for (const url of ["https://metadata.internal/c.json", "https://printer.local/c.json"])
      await expect(resolveClientId(url, "authorize")).rejects.toMatchObject({
        code: "invalid_client",
      });
    expect(net.lookups).toBe(0);
    expect(net.connections).toEqual([]);
  });
  it("connects to the address it checked, so a second DNS answer cannot redirect it", async () => {
    await resolveClientId(claudeCode, "authorize");
    expect(net.lookups).toBe(1);
    expect(net.connections).toEqual(["160.79.104.10"]);
  });
  it("refuses redirects, oversized documents and documents describing another client", async () => {
    serve("", 302);
    await expect(resolveClientId(claudeCode, "authorize")).rejects.toMatchObject({
      code: "invalid_client",
    });
    serve({
      client_id: claudeCode,
      redirect_uris: declared,
      client_name: "x".repeat(20),
      padding: "y".repeat(11000),
    });
    await expect(resolveClientId(claudeCode, "authorize")).rejects.toMatchObject({
      code: "invalid_client",
    });
    serve({ client_id: "https://other.example.com/c.json", redirect_uris: declared });
    await expect(resolveClientId(claudeCode, "authorize")).rejects.toMatchObject({
      code: "invalid_client",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns a registered client UUID unchanged, without any network or database call", async () => {
    await expect(resolveClientId(clientUuid, "authorize")).resolves.toBe(clientUuid);
    expect(net.lookups).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
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
    await expect(
      resolveClientId(claudeCode, "authorize", "key", "http://localhost:61234/callback"),
    ).resolves.toBe(clientUuid);
    expect(rpc).toHaveBeenCalledWith("mcp_client_document", {
      operation: "upsert",
      payload: {
        url: claudeCode,
        rate_limit_key: "key",
        client_name: "Claude Code",
        redirect_uris: ["http://localhost:61234/callback", ...declared],
      },
    });
  });
});
