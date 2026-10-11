# Zyliad MCP bridge

Optional stdio bridge to the Zyliad **remote OAuth MCP**, using the official TypeScript SDK **v2.3.1**. Claude Code and Codex support the remote endpoint directly; prefer that connection.

Requires Node.js 20+. Run `zyliad-mcp https://YOUR-ZYLIAD-HOST/api/mcp`. Your browser opens Zyliad to select a workspace and permissions. Tokens remain in memory only; restarting the bridge requires a new authorization. No token is placed in an argument, config, file or tool result. Browser callback is loopback-only, with state, issuer and PKCE checks.

The web app distributes this package as `/mcp/zyliad-mcp-1.0.0.tgz`; its landing provides the exact npx/npm commands for its own domain. No npm registry publication is required or assumed. Bump the package version and archive filename together when changing released source. Never put a production token in a fixture.

For clients using the bridge, allow up to 180 seconds for startup so the user can complete OAuth. Prefer direct HTTP OAuth for normal users, which lets the client manage persistent credentials.
