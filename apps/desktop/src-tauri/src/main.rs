// Tauri 2 entry point. Vault file IO is handled in JS via @tauri-apps/plugin-fs.
// Native commands here are limited to operations awkward to do from JS, like
// zipping the vault directory for the "Export" action (PRD §4.5.4) and OS
// keychain access for credentials (PRD §5.4, §8.2).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[tauri::command]
fn export_vault(vault_root: String, output_path: String) -> Result<u64, String> {
    let root = PathBuf::from(&vault_root);
    let out = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(out);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut buffer = Vec::new();
    let mut file_count = 0u64;
    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = match path.strip_prefix(&root) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        // Skip `.conflicts/` archives — they're recovery artifacts, not user data.
        if rel.components().next().map(|c| c.as_os_str() == ".conflicts").unwrap_or(false) {
            continue;
        }
        if path.is_file() {
            zip.start_file(rel.to_string_lossy().replace('\\', "/"), options)
                .map_err(|e| e.to_string())?;
            let mut f = BufReader::new(File::open(path).map_err(|e| e.to_string())?);
            buffer.clear();
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            file_count += 1;
        } else if path.is_dir() {
            // best-effort directory entry
            let _ = zip.add_directory(rel.to_string_lossy().replace('\\', "/"), options);
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    let _ = Path::new(&output_path);
    Ok(file_count)
}

/// Write a secret into the OS keychain. `(service, key)` together identify the
/// slot; the value is opaque to us. Empty value deletes the entry.
#[tauri::command]
fn secret_save(service: String, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    if value.is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Read a secret from the OS keychain. Returns `None` (→ JS `null`) when the
/// slot is empty or unset; never errors on "missing", only on backend failure.
#[tauri::command]
fn secret_load(service: String, key: String) -> Result<Option<String>, String> {
    let entry = match keyring::Entry::new(&service, &key) {
        Ok(e) => e,
        Err(e) => return Err(e.to_string()),
    };
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_delete(service: String, key: String) -> Result<(), String> {
    let entry = match keyring::Entry::new(&service, &key) {
        Ok(e) => e,
        Err(e) => return Err(e.to_string()),
    };
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Result of a one-shot MCP server health check. Serialized to the frontend
/// as snake_case keys.
#[derive(serde::Serialize)]
struct McpHealth {
    ok: bool,
    server_name: Option<String>,
    version: Option<String>,
    protocol_version: Option<String>,
    tool_count: usize,
    tools: Vec<String>,
}

/// Spawn the stdio MCP server once, drive a minimal JSON-RPC handshake
/// (initialize → ping → tools/list), and report what came back. Stdin is
/// closed after the requests, so the server hits EOF and exits its read loop;
/// `wait_with_output` then returns its accumulated stdout.
#[tauri::command]
fn mcp_health_check(binary_path: String, vault_root: String) -> Result<McpHealth, String> {
    let mut child = Command::new(&binary_path)
        .env("LOOP_VAULT_ROOT", &vault_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 MCP server（{binary_path}）：{e}"))?;

    {
        let stdin = child.stdin.as_mut().ok_or("无法写入子进程 stdin")?;
        let requests = [
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}"#,
        ];
        for req in requests {
            stdin.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
            stdin.write_all(b"\n").map_err(|e| e.to_string())?;
        }
    } // stdin dropped → EOF → server exits

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut health = McpHealth {
        ok: false,
        server_name: None,
        version: None,
        protocol_version: None,
        tool_count: 0,
        tools: Vec::new(),
    };
    for line in stdout.lines() {
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let result = v.get("result");
        match v.get("id").and_then(|x| x.as_i64()) {
            Some(1) => {
                if let Some(r) = result {
                    health.ok = true;
                    health.protocol_version =
                        r.get("protocolVersion").and_then(|x| x.as_str()).map(String::from);
                    if let Some(si) = r.get("serverInfo") {
                        health.server_name =
                            si.get("name").and_then(|x| x.as_str()).map(String::from);
                        health.version =
                            si.get("version").and_then(|x| x.as_str()).map(String::from);
                    }
                }
            }
            Some(3) => {
                if let Some(tools) = result.and_then(|r| r.get("tools")).and_then(|t| t.as_array()) {
                    health.tools = tools
                        .iter()
                        .filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(String::from))
                        .collect();
                    health.tool_count = health.tools.len();
                }
            }
            _ => {}
        }
    }

    if !health.ok {
        return Err("MCP server 未返回有效的 initialize 响应".to_string());
    }
    Ok(health)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            export_vault,
            secret_save,
            secret_load,
            secret_delete,
            mcp_health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
