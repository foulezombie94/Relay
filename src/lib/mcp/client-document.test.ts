import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { clientId, clientIdUrl, privateAddress, resolveClientId } from "./client-document";

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
});
