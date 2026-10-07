import "server-only";
export function invitationLink(token: string, requestUrl: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid invitation token");
  const base = process.env.NODE_ENV === "production" ? process.env.APP_URL : new URL(requestUrl).origin;
  if (!base) throw new Error("APP_URL is required");
  const url = new URL("/invite", base);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("APP_URL must use HTTPS");
  url.hash = "token=" + token;
  return url.toString();
}
