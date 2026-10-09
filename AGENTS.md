<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Relay repository conventions

Read `CONTRIBUTING.md` and `docs/architecture/README.md` before changing repository structure. Place UI modules in their feature folder and keep tests/CSS with that feature. Keep Next.js route conventions and deployment entry points stable.

Never rewrite or rename an applied file in `supabase/migrations/`. `supabase/legacy/` is historical reference only. Preserve current permission checks, source trust boundaries, exact confirmations, outbox idempotence and worker leases.

For file moves, update imports, re-exports, mocks, filesystem references in tests, CSS imports, npm scripts and documentation links. Run `npm run check:structure`, typecheck, relevant tests and build. Keep historical documents in `docs/history/` or `docs/research/`, and distinguish their dated conclusions from the current architecture.
