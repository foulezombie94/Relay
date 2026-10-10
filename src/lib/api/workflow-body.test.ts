import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("./context", () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import { boundedJsonBody } from "./workflow-body";
function body(text: string) {
  return new NextRequest("https://example.test/api/meeting", { method: "POST", body: text });
}
describe("bounded meeting request decoding", () => {
  it("returns bad request for malformed JSON rather than a server error", async () => {
    await expect(boundedJsonBody(body("{broken"), 100)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects an oversized stream before JSON parsing", async () => {
    await expect(
      boundedJsonBody(body(JSON.stringify({ text: "x".repeat(1000) })), 100),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("decodes valid bounded JSON without assigning browser identity", async () => {
    expect(await boundedJsonBody(body('{"favorite":true}'), 100)).toEqual({ favorite: true });
  });
});
