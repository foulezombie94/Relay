/** Public installation URL, independent of preview domains or browser aliases. */
export function mcpInstallationOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !/^[a-z0-9.:[\]-]+$/i.test(url.hostname) ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      throw new Error("Invalid installation origin");
    return url.origin;
  } catch {
    return "https://VOTRE-DOMAINE";
  }
}
