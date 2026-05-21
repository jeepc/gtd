// Minimal MCP server (stdio transport) exposing the GTD vault.
// Spec: https://modelcontextprotocol.io
//
// Implements just enough of the JSON-RPC handshake + tools to satisfy
// Claude Desktop and similar clients per PRD §4.6.2.

mod vault;
mod tools;

use anyhow::Result;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::main]
async fn main() -> Result<()> {
    let vault_root = std::env::var("GTD_VAULT_ROOT").unwrap_or_else(|_| {
        directories::UserDirs::new()
            .and_then(|d| d.home_dir().to_str().map(String::from))
            .map(|home| format!("{home}/GTD-Vault"))
            .unwrap_or_else(|| "./GTD-Vault".to_string())
    });
    let vault = vault::Vault::new(vault_root.into());

    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin);
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            break;
        }
        let req: Value = match serde_json::from_str(line.trim()) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(resp) = handle_request(&vault, &req).await? {
            let mut text = serde_json::to_string(&resp)?;
            text.push('\n');
            stdout.write_all(text.as_bytes()).await?;
            stdout.flush().await?;
        }
    }
    Ok(())
}

async fn handle_request(vault: &vault::Vault, req: &Value) -> Result<Option<Value>> {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);

    // Notifications: requests without id. We swallow them.
    let is_notification = req.get("id").is_none();

    let result: Result<Value> = match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "serverInfo": { "name": "gtd-mcp-server", "version": "0.1.0" },
            "capabilities": { "tools": {} }
        })),
        "tools/list" => Ok(json!({ "tools": tools::list_tools() })),
        "tools/call" => tools::call_tool(vault, &params).await,
        "ping" => Ok(json!({})),
        "notifications/initialized" => Ok(Value::Null),
        _ => Err(anyhow::anyhow!("method not found: {method}")),
    };

    if is_notification {
        return Ok(None);
    }

    let response = match result {
        Ok(v) => json!({ "jsonrpc": "2.0", "id": id, "result": v }),
        Err(e) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32603, "message": e.to_string() } }),
    };
    Ok(Some(response))
}
