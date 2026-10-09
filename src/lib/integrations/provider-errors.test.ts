import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { externalJson } from "./oauth";

afterEach(() => vi.unstubAllGlobals());

it.each([
  [403, { details: [{ reason: "SERVICE_DISABLED" }] }, 503, "n’est pas activée"],
  [403, { errors: [{ reason: "accessNotConfigured" }] }, 503, "n’est pas activée"],
  [403, { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] }, 409, "Reconnectez"],
  [401, {}, 409, "Reconnectez"],
  [403, { errors: [{ reason: "userRateLimitExceeded" }] }, 429, "Limite"],
  [403, { errors: [{ reason: "domainPolicy" }] }, 403, "organisation"],
  [500, {}, 502, "Réessayez"],
])(
  "maps provider failure %s to the correct action and status",
  async (status, error, expected, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { ...error, message: "private-account-and-token" } }, { status }),
      ),
    );
    await expect(
      externalJson("https://gmail.googleapis.com/gmail/v1/users/me/messages", "fixture-token"),
    ).rejects.toMatchObject({
      status: expected,
      message: expect.stringContaining(message),
    });
    await expect(
      externalJson("https://gmail.googleapis.com/gmail/v1/users/me/messages", "fixture-token"),
    ).rejects.not.toMatchObject({
      message: expect.stringContaining("private-account-and-token"),
    });
  },
);

it("handles a non-JSON rejection without exposing the raw response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private upstream error", { status: 403 })),
  );
  await expect(
    externalJson("https://gmail.googleapis.com/gmail/v1/users/me/messages", "fixture-token"),
  ).rejects.toMatchObject({
    status: 403,
    message: expect.stringContaining("Vérifiez les permissions"),
  });
});
