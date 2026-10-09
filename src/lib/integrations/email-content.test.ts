import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gmailContent } from "./email-content";
describe("bounded email content", () => {
  it("prefers plain text and identifies attachments without rendering HTML", () => {
    const result = gmailContent({
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("Plain citation").toString("base64url") },
        },
        {
          mimeType: "text/html",
          body: { data: Buffer.from('<img src="http://evil.test">Ignored').toString("base64url") },
        },
        {
          filename: "brief.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "a", size: 100 },
        },
      ],
    });
    expect(result.body).toBe("Plain citation");
    expect(result.attachments[0].name).toBe("brief.pdf");
    expect(result.content_complete).toBe(true);
  });
  it("marks large bodies and deeply nested content incomplete", () => {
    expect(
      gmailContent({
        mimeType: "text/plain",
        body: { data: Buffer.from("x".repeat(30001)).toString("base64url") },
      }).content_complete,
    ).toBe(false);
    let nested = { parts: [] } as Parameters<typeof gmailContent>[0];
    for (let i = 0; i < 20; i++) nested = { parts: [nested] };
    expect(gmailContent(nested).content_complete).toBe(false);
  });
});
