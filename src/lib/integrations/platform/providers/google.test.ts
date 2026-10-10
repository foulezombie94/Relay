import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GoogleProvider } from "./google";
import { scopesFor, providerConfigured } from "../registry";
import { hasScopes } from "../scopes";
import { fixtureContext } from "../test-support";
const response = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const scope = (name: string) => "https://www.googleapis.com/auth/" + name;
describe("shared Google adapter", () => {
  const fetch = vi.fn();
  beforeEach(() => {
    fetch.mockReset();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("uses code/PKCE/incremental offline consent and requests only the selected feature", () => {
    const url = new GoogleProvider().connect({
      state: "random-state",
      challenge: "challenge",
      redirectUri: "https://zyliad.example/callback",
      scopes: scopesFor("google-calendar"),
    });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      state: "random-state",
      code_challenge_method: "S256",
      code_challenge: "challenge",
      include_granted_scopes: "true",
      access_type: "offline",
    });
    expect(url.searchParams.get("scope")).not.toMatch(/gmail|drive|spreadsheets/);
    expect(scopesFor("gmail", true)).not.toContain(scope("gmail.send"));
    expect(hasScopes("google", [scope("gmail.compose")], [scope("gmail.send")])).toBe(true);
    expect(scopesFor("google-drive")).not.toContain(scope("drive"));
  });
  it("exchanges code with the server-side verifier and supports rotated refresh tokens", async () => {
    fetch.mockResolvedValueOnce(
      response({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        scope: scope("gmail.readonly"),
        token_type: "Bearer",
      }),
    );
    const provider = new GoogleProvider(),
      grant = await provider.exchangeCode(
        "one-time-code",
        "https://zyliad.example/callback",
        "pkce-verifier",
      );
    expect(grant.credentials.refreshToken).toBe("fixture-refresh");
    expect(Object.fromEntries(fetch.mock.calls[0][1].body)).toMatchObject({
      grant_type: "authorization_code",
      code_verifier: "pkce-verifier",
      client_secret: "fixture-secret",
    });
    fetch.mockResolvedValueOnce(
      response({
        access_token: "new-fixture-access",
        refresh_token: "rotated-fixture-refresh",
        expires_in: 3600,
      }),
    );
    expect((await provider.refreshCredentials(grant.credentials)).credentials.refreshToken).toBe(
      "rotated-fixture-refresh",
    );
  });
  it("classifies a revoked refresh grant without reflecting its error body", async () => {
    fetch.mockResolvedValue(
      response({ error: "invalid_grant", error_description: "fixture-secret" }, 400),
    );
    await expect(
      new GoogleProvider().refreshCredentials(fixtureContext().credentials),
    ).rejects.toMatchObject({ code: "token_revoked", status: 401 });
  });
  it("verifies the external account and revokes the refresh token on disconnect", async () => {
    const context = fixtureContext(),
      provider = new GoogleProvider();
    fetch.mockResolvedValueOnce(
      response({
        sub: context.connection.external_account_id,
        email: context.connection.email,
        email_verified: true,
        access_token: "must-be-filtered",
      }),
    );
    expect(await provider.healthCheck(context)).toEqual({
      id: context.connection.external_account_id,
      name: context.connection.email,
      email: context.connection.email,
    });
    fetch.mockResolvedValueOnce(response({}));
    await provider.disconnect(context);
    expect(fetch.mock.calls[1][0].toString()).toBe("https://oauth2.googleapis.com/revoke");
    expect(fetch.mock.calls[1][1].body.get("token")).toBe(context.credentials.refreshToken);
  });
  it("rejects a health check that identifies a different external account", async () => {
    fetch.mockResolvedValueOnce(
      response({ sub: "another-account", email: "other@example.com", email_verified: true }),
    );
    await expect(new GoogleProvider().healthCheck(fixtureContext())).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
  it("does not expose attachments or entire mailboxes when reading one thread", async () => {
    fetch.mockResolvedValue(
      response({
        id: "thread-1",
        messages: [
          {
            id: "m1",
            threadId: "thread-1",
            payload: {
              mimeType: "multipart/mixed",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: Buffer.from("Only the requested message").toString("base64url") },
                },
                {
                  mimeType: "application/pdf",
                  filename: "contract.pdf",
                  body: {
                    data: Buffer.from("private-attachment-bytes").toString("base64url"),
                    attachmentId: "a1",
                    size: 1000,
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const data = await new GoogleProvider().executeAction(fixtureContext(), "gmail.read_thread", {
      threadId: "thread-1",
    });
    expect(JSON.stringify(data)).toContain("Only the requested message");
    expect(JSON.stringify(data)).not.toContain("private-attachment-bytes");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects header injection before sending and uses a stable MIME message ID", async () => {
    const context = fixtureContext(),
      provider = new GoogleProvider();
    await expect(
      provider.executeAction(context, "gmail.send", {
        to: ["recipient@example.com"],
        subject: "Subject\r\nBcc: victim@example.com",
        body: "body",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(response({ id: "m1", threadId: "t1" }));
    await provider.executeAction(context, "gmail.send", {
      to: ["recipient@example.com"],
      subject: "Résumé",
      body: "Hello",
    });
    const decoded = Buffer.from(
      JSON.parse(fetch.mock.calls[0][1].body).raw,
      "base64url",
    ).toString();
    expect(decoded).toContain(`Message-ID: <zyliad-${context.actor.correlationId}@zyliad.invalid>`);
    expect(decoded).toContain("Content-Type: text/plain");
  });
  it("adds Meet conference creation to a conditional Calendar update", async () => {
    fetch.mockResolvedValue(
      response({ id: "event-1", hangoutLink: "https://meet.google.com/fixture" }),
    );
    await new GoogleProvider().executeAction(fixtureContext(), "calendar.update_event", {
      eventId: "event-1",
      etag: '"current"',
      summary: "Meeting",
      meet: true,
      start: { dateTime: "2026-10-11T12:00:00Z" },
      end: { dateTime: "2026-10-11T13:00:00Z" },
    });
    const [url, options] = fetch.mock.calls[0];
    expect(url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(options.headers["If-Match"]).toBe('"current"');
    expect(JSON.parse(options.body).conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      "hangoutsMeet",
    );
  });
  it("syncs Gmail incrementally from the stored history cursor and preserves it across pagination", async () => {
    fetch.mockResolvedValueOnce(
      response({
        historyId: "9999",
        nextPageToken: "page-2",
        history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1" } }] }],
      }),
    );
    const first = await new GoogleProvider().sync(fixtureContext(), "gmail:inbox", {
      historyId: "100",
      zyliad_pages: 1,
    });
    expect(first.cursor).toEqual({ historyId: "100", pageToken: "page-2" });
    expect(first.complete).toBe(false);
    expect(fetch.mock.calls[0][0].searchParams.get("startHistoryId")).toBe("100");
    fetch.mockResolvedValueOnce(response({ historyId: "10000", history: [] }));
    const final = await new GoogleProvider().sync(fixtureContext(), "gmail:inbox", first.cursor);
    expect(final.cursor).toEqual({ historyId: "10000" });
    expect(final.complete).toBe(true);
  });
  it("anchors the initial selected inbox before listing only recent messages", async () => {
    fetch
      .mockResolvedValueOnce(response({ historyId: "100" }))
      .mockResolvedValueOnce(response({ messages: [{ id: "m1" }] }));
    const result = await new GoogleProvider().sync(fixtureContext(), "gmail:inbox", {});
    expect(fetch.mock.calls[0][0].pathname).toContain("profile");
    expect(fetch.mock.calls[1][0].searchParams.get("q")).toBe("in:inbox newer_than:30d");
    expect(result.objects[0].data).toEqual({ id: "m1" });
  });
  it("validates Calendar channel token, channel ID and resource ID, even for an empty body", async () => {
    const context = {
        ...fixtureContext(),
        subscription: {
          id: "channel-1",
          resourceId: "resource-1",
          resource: "calendar:owner@example.com",
        },
      },
      provider = new GoogleProvider();
    const headers = new Headers({
      "x-goog-channel-token": context.credentials.signingSecret!,
      "x-goog-channel-id": "channel-1",
      "x-goog-resource-id": "resource-1",
      "x-goog-message-number": "42",
    });
    expect((await provider.handleWebhook(Buffer.alloc(0), headers, context)).eventId).toBe(
      "channel-1:42",
    );
    headers.set("x-goog-resource-id", "other-account");
    await expect(provider.handleWebhook(Buffer.alloc(0), headers, context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("writes Sheets values in RAW mode and classifies 429/5xx cleanly", async () => {
    fetch.mockResolvedValueOnce(response({ updatedCells: 1 }));
    const provider = new GoogleProvider(),
      input = { spreadsheetId: "s1", range: "A1", values: [['=IMPORTXML("untrusted")']] };
    await provider.executeAction(fixtureContext(), "sheets.write_range", input);
    expect(fetch.mock.calls[0][0].searchParams.get("valueInputOption")).toBe("RAW");
    fetch.mockResolvedValueOnce(response({ api_key: "private" }, 429, { "Retry-After": "120" }));
    await expect(
      provider.executeAction(fixtureContext(), "drive.get_file", { fileId: "f1" }),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfter: 120 });
    fetch.mockResolvedValueOnce(response({ access_token: "private" }, 503));
    await expect(
      provider.executeAction(fixtureContext(), "drive.get_file", { fileId: "f1" }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
  it("keeps unimplemented providers unavailable and rejects an invalid vault configuration", () => {
    expect(providerConfigured("microsoft")).toBe(false);
    vi.stubEnv("INTEGRATION_VAULT_KEYS", "{}");
    expect(providerConfigured("google")).toBe(false);
  });
});
