# Zyliad MCP installer

Install the native **HTTP OAuth** connection in Claude Code or Codex once:

```sh
zyliad-mcp install --client claude https://YOUR-ZYLIAD-HOST/api/mcp
zyliad-mcp install --client codex https://YOUR-ZYLIAD-HOST/api/mcp
```

Requires Node.js 20+ and the selected client CLI. Claude is configured in user scope across projects; open `/mcp` to authorize once. Codex opens OAuth on its first native add. Existing matching HTTP configurations are reused without triggering login again. The installer migrates our old stdio bridge at the same URL; it refuses to replace another issuer or an unrelated server.

The client manages persistent credentials and refresh tokens in its own credential store. The installer never reads, stores or prints OAuth tokens. It invokes the CLI with argument arrays without a shell. Use the canonical Zyliad domain so changing preview URLs does not create new credential identities. Expiry (30 days maximum), revocation or removed membership legitimately require authorization again.

The app distributes `/mcp/zyliad-mcp-1.1.1.tgz`; its landing provides exact npx/npm installer commands. No npm registry publication is assumed. Version 1.0.0 remains available for existing configurations. Bump the version and archive filename together when changing released source.

An advanced session-only stdio bridge remains available as `zyliad-mcp https://YOUR-ZYLIAD-HOST/api/mcp`, using official TypeScript SDK **v2.3.1**. Its tokens remain in memory; restarting this bridge requires authorization again. Normal Claude Code/Codex users should migrate using the install command above. No token is placed in an argument, config, file or tool result by the bridge. Callback is loopback-only with state, issuer and PKCE checks. Allow up to 180 seconds for its initial OAuth.
