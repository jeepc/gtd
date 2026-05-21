# gtd-mcp-server

Standalone MCP server (stdio transport) that exposes the GTD vault to AI clients like Claude Desktop. Built per PRD §4.6.2.

## Build

```bash
cargo build --release --manifest-path apps/mcp-server/Cargo.toml
```

The binary lands at `apps/mcp-server/target/release/gtd-mcp-server`.

## Configure Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gtd": {
      "command": "/path/to/gtd-mcp-server",
      "env": { "GTD_VAULT_ROOT": "/Users/you/GTD-Vault" }
    }
  }
}
```

`GTD_VAULT_ROOT` defaults to `~/GTD-Vault`.

## Tools

| Tool | Purpose |
|------|---------|
| `list_entries`   | List entries filtered by date / tag / status |
| `create_entry`   | Create todo/done/log |
| `complete_entry` | Mark todo done |
| `update_entry`   | Rewrite content |
| `delete_entry`   | Tombstone (reversible for 30 days) |
| `search_entries` | Full-text + tag search |
| `get_recent_logs`| Logs from the last N days |

The server reads the same `YYYY/MM/YYYY-MM-DD.md` format as the desktop app, so all platforms stay in sync.
