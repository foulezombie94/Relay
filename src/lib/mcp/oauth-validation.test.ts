import { describe, it, expect } from "vitest";
import {
  registrationSchema,
  authorizationSchema,
  tokenSchema,
  uniqueParams,
} from "./oauth-validation";
import { parseTool } from "./contracts";
const client = "cf967873-7e4e-4d9a-b54b-8797f2583213";
describe("MCP OAuth validation", () => {
  it("permits only HTTPS or exact loopback callbacks", () => {
    for (const uri of [
      "https://client.example/callback",
      "http://127.0.0.1:3334/callback",
      "http://localhost:1455/auth/callback",
    ])
      expect(registrationSchema.safeParse({ redirect_uris: [uri] }).success).toBe(true);
    for (const uri of [
      "javascript:alert(1)",
      "http://attacker.example/callback",
      "http://localhost/callback",
      "https://user:password@client.example/callback",
      "https://client.example/callback#token",
    ])
      expect(registrationSchema.safeParse({ redirect_uris: [uri] }).success).toBe(false);
  });
  it("requires code flow, S256, state, audience and recognized scopes", () => {
    const base = {
      client_id: client,
      redirect_uri: "http://127.0.0.1:3334/callback",
      response_type: "code",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      state: "random-client-state",
      resource: "https://zyliad.example/api/mcp",
    };
    expect(authorizationSchema.parse(base).scope).toEqual([
      "records:read",
      "tasks:read",
      "configuration:read",
    ]);
    for (const invalid of [
      { response_type: "token" },
      { code_challenge_method: "plain" },
      { state: "" },
      { scope: "admin:*" },
      { workspace_id: client },
      { resource: undefined },
    ])
      expect(authorizationSchema.safeParse({ ...base, ...invalid }).success).toBe(false);
  });
  it("rejects duplicate OAuth parameters and token type confusion", () => {
    expect(() => uniqueParams(new URLSearchParams("client_id=a&client_id=b"))).toThrow();
    expect(
      tokenSchema.safeParse({
        grant_type: "refresh_token",
        client_id: client,
        refresh_token: "zmc_a_" + "a".repeat(43),
        resource: "https://zyliad.example/api/mcp",
      }).success,
    ).toBe(false);
    expect(
      tokenSchema.safeParse({ grant_type: "client_credentials", client_id: client }).success,
    ).toBe(false);
  });
  it("rejects arbitrary URLs, workspace switching and destructive mutation fields", () => {
    expect(() => parseTool("zyliad_search_records", { workspace_id: client })).toThrow();
    expect(() => parseTool("zyliad_read_source", { kind: "credentials", id: client })).toThrow();
    expect(() =>
      parseTool("zyliad_update_record", {
        request_id: client,
        values: { id: client, version: 1, values: { archived: true } },
      }),
    ).toThrow();
    expect(() =>
      parseTool("zyliad_create_note", {
        request_id: client,
        values: { content: "Private source", private: false },
      }),
    ).toThrow();
    expect(
      parseTool("zyliad_create_note", {
        request_id: client,
        values: { content: "Private source" },
      }),
    ).toMatchObject({ values: { private: true } });
  });
});
