import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmedRow, request } from "./request";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CRM request reliability", () => {
  it("accepts a confirmed row and sends a creation retry key", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { id: "created" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await request<{ data: { id: string } }>(
      "/api/records",
      "POST",
      { email: "a@example.test" },
      { idempotencyKey: "attempt" },
    );
    expect(confirmedRow(result.data, "created").id).toBe("created");
    expect(new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key")).toBe("attempt");
  });
  it.each([null, undefined, { id: "" }, { id: "other" }])(
    "refuses an unconfirmed write: %s",
    (data) => {
      expect(() => confirmedRow(data, "expected")).toThrow("Aucune ligne");
    },
  );
  it("hides ECONNRESET and never retries a write automatically", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed: ECONNRESET private-host"));
    vi.stubGlobal("fetch", fetch);
    await expect(request("/api/records", "POST", {})).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("saisie est conservée"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    Response.json({ error: "secret stack trace" }, { status: 500 }),
    new Response("private proxy stack", { status: 502 }),
    Response.json(null),
    new Response("<html>broken</html>"),
  ])("rejects server failures and invalid responses without exposing details", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(request("/api/records", "POST", {})).rejects.toMatchObject({
      message: expect.not.stringMatching(/secret|stack|private|html/),
    });
  });
  it("preserves actionable validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Adresse email requise" }, { status: 400 })),
    );
    await expect(request("/api/records", "POST", {})).rejects.toMatchObject({
      status: 400,
      message: "Adresse email requise",
    });
  });
  it("sends multipart imports without replacing their boundary with JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ queued: true }));
    vi.stubGlobal("fetch", fetch);
    const form = new FormData();
    form.set("object_id", "object");
    await request("/api/imports", "POST", form);
    expect(fetch.mock.calls[0][1].body).toBe(form);
    expect(new Headers(fetch.mock.calls[0][1].headers).has("Content-Type")).toBe(false);
  });
  it("times out a stalled request and aborts it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("secret", "AbortError")),
            ),
          ),
      ),
    );
    const result = request("/api/records", "POST", {}, { timeoutMs: 100 });
    const assertion = expect(result).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining("saisie est conservée"),
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
  it("also bounds stalled response bodies", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        Promise.resolve({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) =>
              init.signal.addEventListener("abort", () =>
                reject(new DOMException("", "AbortError")),
              ),
            ),
        }),
      ),
    );
    const assertion = expect(
      request("/api/records", "PATCH", {}, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});
