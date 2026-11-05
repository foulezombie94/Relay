import "server-only";
import { externalJson } from "./oauth";
export async function deliver(
  provider: "gmail" | "outlook",
  token: string,
  data: { to: string; subject: string; body: string; html?: string },
  messageId?: string,
) {
  if (provider === "gmail") {
    const headers =
      "To: " +
      data.to +
      "\r\nSubject: =?UTF-8?B?" +
      Buffer.from(data.subject).toString("base64") +
      "?=\r\n" +
      (messageId ? "Message-ID: <" + messageId + ">\r\n" : "") +
      "MIME-Version: 1.0\r\n";
    const part = (type: string, content: string) =>
      "Content-Type: " +
      type +
      "; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
      (
        Buffer.from(content)
          .toString("base64")
          .match(/.{1,76}/g) ?? []
      ).join("\r\n");
    // Tracked messages carry the unchanged text and its HTML alternative.
    const boundary = "zyliad-" + crypto.randomUUID();
    const mime = data.html
      ? headers +
        `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
        `--${boundary}\r\n${part("text/plain", data.body)}\r\n` +
        `--${boundary}\r\n${part("text/html", data.html)}\r\n--${boundary}--\r\n`
      : headers + part("text/plain", data.body);
    const result = await externalJson(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
      },
    );
    return typeof result.id === "string" ? result.id : null;
  }
  await externalJson("https://graph.microsoft.com/v1.0/me/sendMail", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: data.subject,
        body: data.html
          ? { contentType: "HTML", content: data.html }
          : { contentType: "Text", content: data.body },
        toRecipients: [{ emailAddress: { address: data.to } }],
      },
      saveToSentItems: true,
    }),
  });
  return null;
}
