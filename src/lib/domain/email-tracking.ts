/** Unique http(s) links of a plain-text email, in order of appearance (at most 20). */
export function extractLinks(text: string) {
  const links: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url.length <= 2000 && !links.includes(url)) links.push(url);
    if (links.length === 20) break;
  }
  return links;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * HTML alternative of a plain-text email: escaped text, clickable links (rewritten
 * through the tracking redirect when clicks are tracked) and an optional 1×1 pixel.
 * The plain-text part is sent unchanged next to it.
 */
export function trackedHtml(
  text: string,
  options: { links: string[]; clickUrl?: (position: number) => string; pixelUrl?: string },
) {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const raw = match[0];
    const url = raw.replace(/[.,;:!?]+$/, "");
    const index = match.index ?? 0;
    parts.push(escapeHtml(text.slice(last, index)));
    const position = options.links.indexOf(url) + 1;
    const href = position > 0 && options.clickUrl ? options.clickUrl(position) : url;
    parts.push(`<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`);
    parts.push(escapeHtml(raw.slice(url.length)));
    last = index + raw.length;
  }
  parts.push(escapeHtml(text.slice(last)));
  const body = parts.join("").replace(/\r?\n/g, "<br>\n");
  const pixel = options.pixelUrl
    ? `<img src="${escapeHtml(options.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    : "";
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${body}</div>${pixel}</body></html>`;
}

/**
 * Security scanners and link previewers fetch links before (or instead of) the
 * recipient. Their hits redirect normally but are not counted as engagement.
 * Mail proxies that load images on behalf of a reader (Gmail, Apple) are counted:
 * open counts remain an estimate.
 */
export function automatedAgent(userAgent: string | null) {
  if (!userAgent) return true;
  return /bot|crawler|spider|preview|scanner|barracuda|proofpoint|mimecast|safelinks|symantec|forcepoint|trend ?micro|sophos|fortiguard|cisco|ironport|slack|discord|whatsapp|telegram|facebookexternalhit|linkedin|curl|wget|python|go-http|okhttp|headless/i.test(
    userAgent,
  );
}
