// MCP tool dispatch — see PRD §4.6.2.

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::vault::{parse_status, strip_system_fields, Entry, Status, Vault};

/// Serialize a single entry for AI output with `_`-prefixed fields stripped.
fn one(entry: Entry) -> Value {
    json!(strip_system_fields(vec![entry]).pop().unwrap())
}

pub fn list_tools() -> Value {
    json!([
        {
            "name": "list_entries",
            "description": "List entries from the Loop vault, optionally filtered by date / tag / status.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "date": { "type": "string", "description": "YYYY-MM-DD" },
                    "tag":  { "type": "string" },
                    "status": { "type": "string", "enum": ["todo", "done", "log"] }
                }
            }
        },
        {
            "name": "create_entry",
            "description": "Create a new entry. status defaults to 'todo'.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string" },
                    "status": { "type": "string", "enum": ["todo", "done", "log"] }
                },
                "required": ["content"]
            }
        },
        {
            "name": "complete_entry",
            "description": "Mark a todo as done.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "update_entry",
            "description": "Update an entry's content.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["id"]
            }
        },
        {
            "name": "delete_entry",
            "description": "Delete an entry (tombstone; reversible for 30 days).",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "set_entry_property",
            "description": "Set or delete an open metadata field on an entry (e.g. due, priority, project). Pass value null to delete the key. Date dues like \"2026-05-25\" or \"2026-05-25T09:00\" schedule a reminder in the apps.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "key": { "type": "string", "description": "letter/underscore start, ≤40 chars" },
                    "value": { "description": "Scalar (string/number/boolean) or null to delete the key." }
                },
                "required": ["id", "key"]
            }
        },
        {
            "name": "search_entries",
            "description": "Full-text + tag search across the vault.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "integer", "default": 50 }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_recent_logs",
            "description": "Return logs from the last N days (default 7).",
            "inputSchema": {
                "type": "object",
                "properties": { "days": { "type": "integer", "default": 7 } }
            }
        }
    ])
}

pub async fn call_tool(vault: &Vault, params: &Value) -> Result<Value> {
    let name = params.get("name").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("missing tool name"))?;
    let args = params.get("arguments").cloned().unwrap_or(Value::Null);

    let result = match name {
        "list_entries" => {
            let date = args.get("date").and_then(|v| v.as_str());
            let tag = args.get("tag").and_then(|v| v.as_str());
            let status = args.get("status").and_then(|v| v.as_str()).and_then(parse_status);
            let entries = vault.list_entries(date, tag, status.as_ref())?;
            json!(strip_system_fields(entries))
        }
        "create_entry" => {
            let content = args.get("content").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("content required"))?;
            let status = args.get("status").and_then(|v| v.as_str()).and_then(parse_status).unwrap_or(Status::Todo);
            one(vault.create_entry(content, status)?)
        }
        "complete_entry" => {
            let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("id required"))?;
            one(vault.update_entry(id, None, Some(Status::Done))?)
        }
        "update_entry" => {
            let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("id required"))?;
            let content = args.get("content").and_then(|v| v.as_str());
            one(vault.update_entry(id, content, None)?)
        }
        "delete_entry" => {
            let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("id required"))?;
            vault.delete_entry(id)?;
            json!({ "ok": true })
        }
        "set_entry_property" => {
            let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("id required"))?;
            let key = args.get("key").and_then(|v| v.as_str()).ok_or_else(|| anyhow!("key required"))?;
            let value = args.get("value").cloned().unwrap_or(Value::Null);
            one(vault.set_property(id, key, value)?)
        }
        "search_entries" => {
            let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            json!(strip_system_fields(vault.search(q, limit)?))
        }
        "get_recent_logs" => {
            let days = args.get("days").and_then(|v| v.as_i64()).unwrap_or(7);
            let cutoff = chrono::Utc::now().date_naive() - chrono::Duration::days(days);
            let mut out = Vec::new();
            for date in vault.list_dates()? {
                let d = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")?;
                if d < cutoff { break; }
                for e in vault.read_day(&date)? {
                    if e.metadata.deleted.is_some() { continue; }
                    if matches!(e.status, Status::Log) { out.push(e); }
                }
            }
            json!(strip_system_fields(out))
        }
        _ => return Err(anyhow!("unknown tool: {name}")),
    };

    Ok(json!({
        "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result)? }]
    }))
}
