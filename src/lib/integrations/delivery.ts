import "server-only";
import { externalJson } from "./oauth";
export async function deliver(
  provider: "gmail" | "outlook",
  token: string,
  data: { to: string; subject: string; body: string },
  messageId?: string,
) {
  if (provider === "gmail") {
    const mime =
      "To: " +
      data.to +
      "\r\nSubject: =?UTF-8?B?" +
      Buffer.from(data.subject).toString("base64") +
      "?=\r\n" +
      (messageId ? "Message-ID: <" + messageId + ">\r\n" : "") +
      "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" +
      Buffer.from(data.body).toString("base64");
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
        body: { contentType: "Text", content: data.body },
        toRecipients: [{ emailAddress: { address: data.to } }],
      },
      saveToSentItems: true,
    }),
  });
  return null;
}
