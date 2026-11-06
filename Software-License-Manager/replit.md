# License Manager

A secure license control center with a browser dashboard, verification API, usage analytics, and optional Discord bot commands.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/license-manager run dev` — run the dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required runtime: `DATABASE_URL`, Clerk-managed auth settings
- Admin access: `LICENSE_ADMIN_USER_IDS` — comma-separated Clerk user IDs
- Optional Discord bot: secret `DISCORD_BOT_TOKEN`, `DISCORD_LICENSE_ADMIN_ROLE_IDS`, optional `DISCORD_GUILD_ID`
- Optional audit notifications: secret `DISCORD_WEBHOOK_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/license-manager/` — dashboard, Clerk UI, and Lua client setup example
- `artifacts/api-server/src/routes/licenses.ts` — license and analytics API
- `artifacts/api-server/src/lib/licenseService.ts` — key lifecycle, verification, and event logic
- `artifacts/api-server/src/discord/licenseBot.ts` — optional dedicated Discord bot commands
- `lib/api-spec/openapi.yaml` — source API contract
- `lib/db/src/schema/licenses.ts` — PostgreSQL schema

## Architecture decisions

- Uses the existing PostgreSQL/Drizzle stack rather than adding a second database.
- Stores license-key digests; the full key is returned only at creation time.
- Binds licenses to an explicit installation ID supplied by the client, not a hidden hardware fingerprint.
- Discord commands are a separate bot integration and do not import or run user-account/selfbot code.

## Product

Issue and manage time-limited software licenses, review validation activity, and monitor checkpoint-to-validation analytics.

## User preferences

- Keep the existing Discord bot source separate; do not run or copy its uploaded configuration.

## Gotchas

- Add the signed-in Clerk user ID to `LICENSE_ADMIN_USER_IDS` before opening admin pages.
- Discord command registration remains disabled until a dedicated bot token and allowed role IDs are configured.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
