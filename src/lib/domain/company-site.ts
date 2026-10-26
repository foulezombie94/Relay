export function companySite(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || raw.length > 2000) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (
      !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$/.test(host) ||
      /\.(local|internal|localhost|test|invalid)$/.test(host)
    )
      return null;
    return { href: url.href, host, icon: `https://${host}/favicon.ico` };
  } catch {
    return null;
  }
}
