# License Manager

License Manager provides a browser dashboard and a shared API for issuing, verifying, and auditing software licenses. The dashboard uses Clerk sign-in; the API and Discord command handler run in the existing Express API server.

## Administrator access

1. Sign in to the dashboard.
2. Copy the Clerk user ID shown on the administrator access screen.
3. Set `LICENSE_ADMIN_USER_IDS` to that ID in the project environment. Multiple IDs can be comma-separated.
4. Restart the API Server workflow.

Signed-in users who are not on this list cannot view or change license data.

## Discord license commands

The bot integration uses a dedicated Discord bot account and is disabled until these are configured:

- Secret `DISCORD_BOT_TOKEN`
- `DISCORD_LICENSE_ADMIN_ROLE_IDS` with one or more allowed role IDs
- Optional `DISCORD_GUILD_ID` to register commands to one server during setup; without it, commands register globally
- Optional secret `DISCORD_WEBHOOK_URL` for activation, successful validation, and security-event notifications

Commands are `/genkey`, `/checkkey`, `/resethwid`, and `/revoke`. Responses containing keys or license details are ephemeral. Server administrators can use the commands even if they are not in the configured role list. Do not use a personal Discord account token or selfbot.

## License and client behavior

- License expiration begins at issuance and is not extended by activation.
- The database stores a SHA-256 digest of each key. The full key is shown only once when created.
- Device registration uses an explicit, client-generated installation ID. It does not read hardware identifiers.
- Client examples and test forms are under **Client setup**. The Lua example uses LuaSocket, LuaSec, and dkjson; replace the sample API host before use.
- Client code can be modified by its user. Server verification is authoritative for the API response, but cannot force a hostile client to honor that response.

The verification and checkpoint rate limits use per-process memory. Use a shared rate-limit store before running multiple API instances.
