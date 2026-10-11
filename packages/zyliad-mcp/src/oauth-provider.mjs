import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";

export function validEndpoint(value, allowLocal = false) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    u.pathname !== "/api/mcp" ||
    (u.protocol !== "https:" &&
      !(
        allowLocal &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      ))
  )
    throw new Error("Use the HTTPS Zyliad /api/mcp endpoint.");
  return u;
}
export function validCallback(params, expectedState, issuer) {
  if ([...params.keys()].some((k) => params.getAll(k).length !== 1)) return false;
  const actual = Buffer.from(params.get("state") ?? ""),
    expected = Buffer.from(expectedState);
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected) &&
    params.get("iss") === issuer &&
    (params.get("error") === "access_denied" ||
      /^[A-Za-z0-9_-]{43}$/.test(params.get("code") ?? ""))
  );
}
// The optional bridge stores tokens only in process memory. Normal remote
// clients use their own OAuth credential store; there is no secret on disk here.
export async function createOAuthProvider(endpoint, openBrowser = true) {
  let info, tokens, verifier, discovery;
  const state = randomBytes(32).toString("base64url");
  let resolve,
    reject,
    used = false;
  const callback = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Prevent an unhandled rejection before the caller starts awaiting OAuth.
  callback.catch(() => {});
  const listener = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (
      req.method !== "GET" ||
      u.pathname !== "/oauth/callback" ||
      used ||
      !validCallback(u.searchParams, state, endpoint.origin)
    ) {
      res.writeHead(400, { "Cache-Control": "no-store" });
      res.end("Invalid OAuth callback.");
      return;
    }
    used = true;
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("Zyliad connected. You can close this window.");
    if (u.searchParams.has("error")) reject(new Error("Authorization denied."));
    else resolve(u.searchParams);
  });
  await new Promise((yes, no) => {
    listener.once("error", no);
    listener.listen(0, "127.0.0.1", yes);
  });
  const port = listener.address().port;
  const timer = setTimeout(() => {
    reject(new Error("OAuth timed out."));
    listener.close();
  }, 180000);
  timer.unref();
  const provider = {
    redirectUrl: `http://127.0.0.1:${port}/oauth/callback`,
    clientMetadata: {
      client_name: "Zyliad MCP bridge",
      redirect_uris: [`http://127.0.0.1:${port}/oauth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope:
        "records:read tasks:read notes:read meetings:read communications:read documents:read commitments:read configuration:read crm:write",
    },
    state: () => state,
    clientInformation: () => info,
    saveClientInformation: (v) => {
      info = v;
    },
    tokens: () => tokens,
    saveTokens: (v) => {
      tokens = v;
    },
    saveCodeVerifier: (v) => {
      verifier = v;
    },
    codeVerifier: () => {
      if (!verifier) throw new Error("No PKCE verifier.");
      return verifier;
    },
    saveDiscoveryState: (v) => {
      if (v.authorizationServerUrl && new URL(v.authorizationServerUrl).origin !== endpoint.origin)
        throw new Error("Unexpected OAuth issuer.");
      discovery = v;
    },
    discoveryState: () => discovery,
    validateResourceURL: async (_url, resource) => {
      if (resource && resource !== endpoint.href) throw new Error("Unexpected OAuth audience.");
      return endpoint;
    },
    redirectToAuthorization: async (url) => {
      if (url.origin !== endpoint.origin || url.pathname !== "/api/mcp/oauth/authorize")
        throw new Error("Unexpected OAuth authorization endpoint.");
      process.stderr.write(`Authorize Zyliad in your browser:\n${url.href}\n`);
      if (openBrowser) {
        const [program, args] =
          process.platform === "darwin"
            ? ["open", [url.href]]
            : process.platform === "win32"
              ? ["rundll32", ["url.dll,FileProtocolHandler", url.href]]
              : ["xdg-open", [url.href]];
        const child = spawn(program, args, { stdio: "ignore", detached: true, shell: false });
        child.on("error", () => {});
        child.unref();
      }
    },
    invalidateCredentials: (scope) => {
      if (scope === "all" || scope === "client") info = undefined;
      if (scope === "all" || scope === "tokens") tokens = undefined;
      if (scope === "all" || scope === "verifier") verifier = undefined;
      if (scope === "all" || scope === "discovery") discovery = undefined;
    },
  };
  return {
    provider,
    callback,
    close: () => {
      clearTimeout(timer);
      listener.close();
    },
  };
}
