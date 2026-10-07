import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { publicAddress, workflowURL } from "./workflow-http";
describe("external action network boundary", () => {
  it("blocks private, loopback, metadata and IPv6 translations", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.168.1.1",
      "::1",
      "::ffff:127.0.0.1",
      "64:ff9b::a00:1",
      "64:ff9b:1::1",
      "fe80::1",
      "fc00::1",
      "::192.168.1.1",
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("requires HTTPS, no credentials, and exact Slack origin", () => {
    for (const url of [
      "http://example.com/",
      "https://127.0.0.1/",
      "https://user:pass@example.com",
      "https://service.local/",
      "https://example.com:8443/",
    ])
      expect(() => workflowURL(url)).toThrow();
    expect(() => workflowURL("https://hooks.slack.com.evil.com/services/T/B/K", true)).toThrow();
    expect(workflowURL("https://hooks.slack.com/services/T/B/K", true).hostname).toBe(
      "hooks.slack.com",
    );
  });
});
