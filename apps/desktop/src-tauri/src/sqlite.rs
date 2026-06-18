// Custom single-connection SQLite layer for the v2.0 storage engine (PRD §6.2).
//
// `tauri-plugin-sql` runs each call against a connection *pool* and exposes no
// transaction primitive, so it cannot honour the core `Storage.transaction(fn)`
// contract (BEGIN…COMMIT + interleaved reads, plus `PRAGMA defer_foreign_keys`
// during replay). Instead we hold a single `rusqlite::Connection` behind a Mutex
// and expose three commands; the JS side serializes transactions so BEGIN/COMMIT
// always land on this one connection. `data.db` is the disposable local query
// authority — never synced, rebuilt from the op log when missing (§1.5.5).

use std::sync::Mutex;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{Map, Number, Value as Json};

/// Managed Tauri state: the one open connection (or none before `sql_open`).
#[derive(Default)]
pub struct SqlState(pub Mutex<Option<Connection>>);

/// Convert an incoming JSON param into a bindable SQLite value. Objects/arrays
/// are rejected — only scalars cross the boundary (matches core `SqlParam`).
fn to_sql_value(v: &Json) -> Result<SqlValue, String> {
    match v {
        Json::Null => Ok(SqlValue::Null),
        Json::Bool(b) => Ok(SqlValue::Integer(if *b { 1 } else { 0 })),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(SqlValue::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(SqlValue::Real(f))
            } else {
                Err("unsupported numeric param".to_string())
            }
        }
        Json::String(s) => Ok(SqlValue::Text(s.clone())),
        _ => Err("object/array params are not supported".to_string()),
    }
}

fn to_json(v: ValueRef<'_>) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::Number(Number::from(i)),
        ValueRef::Real(f) => Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        // Blobs are not part of the schema; surface as null rather than failing.
        ValueRef::Blob(_) => Json::Null,
    }
}

fn map_params(params: &[Json]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(to_sql_value).collect()
}

/// Open (or replace) the connection at `path`, enabling WAL so the app and the
/// Node MCP server can share the file, and foreign keys so the schema's
/// `ON DELETE SET NULL`/`CASCADE` rules actually fire.
#[tauri::command]
pub fn sql_open(state: tauri::State<'_, SqlState>, path: String) -> Result<(), String> {
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(conn);
    Ok(())
}

/// Run a statement with no result set: INSERT/UPDATE/DELETE/DDL/PRAGMA and the
/// BEGIN/COMMIT/ROLLBACK transaction-control statements. Param-less calls go
/// through `execute_batch` so multi-statement DDL and rows-returning PRAGMAs
/// (e.g. `journal_mode`) are tolerated.
#[tauri::command]
pub fn sql_execute(
    state: tauri::State<'_, SqlState>,
    sql: String,
    params: Vec<Json>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("database not open")?;
    if params.is_empty() {
        conn.execute_batch(&sql).map_err(|e| e.to_string())?;
    } else {
        let values = map_params(&params)?;
        conn.execute(&sql, rusqlite::params_from_iter(values.iter()))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Run a query and return every row as a JSON object keyed by column name.
#[tauri::command]
pub fn sql_select(
    state: tauri::State<'_, SqlState>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("database not open")?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let values = map_params(&params)?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(values.iter()))
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::new();
        for (i, name) in col_names.iter().enumerate() {
            let v = row.get_ref(i).map_err(|e| e.to_string())?;
            obj.insert(name.clone(), to_json(v));
        }
        out.push(obj);
    }
    Ok(out)
}
