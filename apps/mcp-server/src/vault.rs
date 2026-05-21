// Vault: file-based store mirroring packages/core/src/vault.ts.
// Reads and writes the same `YYYY/MM/YYYY-MM-DD.md` format so the desktop
// app and the MCP server share state.

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status { Todo, Done, Log }

/// Open key-value metadata (PRD §6.7). Base fields are recognized by name;
/// every other key lands in `extra` via `#[serde(flatten)]`. The flatten
/// catch-all is what stops MCP rewrites from silently dropping keys (e.g. a
/// `due` set by the apps) — the previous fixed struct discarded unknown fields.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log: Option<String>,
    pub updated: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub id: String,
    pub content: String,
    pub status: Status,
    pub tags: Vec<String>,
    pub date: String,
    pub metadata: Metadata,
}

pub struct Vault {
    root: PathBuf,
}

impl Vault {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn path_for_date(&self, date: &str) -> PathBuf {
        let (y, m) = (&date[0..4], &date[5..7]);
        self.root.join(y).join(m).join(format!("{date}.md"))
    }

    pub fn list_dates(&self) -> Result<Vec<String>> {
        let mut dates: Vec<String> = Vec::new();
        if !self.root.exists() {
            return Ok(dates);
        }
        for entry in walkdir(&self.root)? {
            let p = entry.to_string_lossy();
            if let Some(name) = entry.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".md") && !p.contains("/.conflicts/") {
                    if let Some(date) = filename_date(name) {
                        dates.push(date);
                    }
                }
            }
        }
        dates.sort();
        dates.reverse();
        dates.dedup();
        Ok(dates)
    }

    pub fn read_day(&self, date: &str) -> Result<Vec<Entry>> {
        let path = self.path_for_date(date);
        if !path.exists() {
            return Ok(Vec::new());
        }
        let text = fs::read_to_string(&path)?;
        Ok(parse_day_file(&text, date))
    }

    pub fn write_day(&self, date: &str, entries: &[Entry]) -> Result<()> {
        let path = self.path_for_date(date);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let mut out = String::new();
        out.push_str("---\n");
        out.push_str(&format!("date: {date}\nversion: 1\nupdatedAt: {now}\n"));
        out.push_str("---\n\n");
        for e in entries {
            out.push_str(&serialize_entry(e));
            out.push('\n');
        }
        fs::write(path, out)?;
        Ok(())
    }

    pub fn list_entries(&self, date: Option<&str>, tag: Option<&str>, status: Option<&Status>) -> Result<Vec<Entry>> {
        let dates = if let Some(d) = date {
            vec![d.to_string()]
        } else {
            self.list_dates()?
        };
        let mut out = Vec::new();
        for d in dates {
            for e in self.read_day(&d)? {
                if e.metadata.deleted.is_some() { continue; }
                if let Some(t) = tag { if !e.tags.iter().any(|x| x == t) { continue; } }
                if let Some(s) = status {
                    if std::mem::discriminant(s) != std::mem::discriminant(&e.status) { continue; }
                }
                out.push(e);
            }
        }
        Ok(out)
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Entry>> {
        let lowered = query.to_lowercase();
        let mut out = Vec::new();
        for d in self.list_dates()? {
            for e in self.read_day(&d)? {
                if e.metadata.deleted.is_some() { continue; }
                if e.content.to_lowercase().contains(&lowered)
                    || e.tags.iter().any(|t| t == query.trim_start_matches('#')) {
                    out.push(e);
                    if out.len() >= limit { return Ok(out); }
                }
            }
        }
        Ok(out)
    }

    pub fn create_entry(&self, content: &str, status: Status) -> Result<Entry> {
        let now = Utc::now();
        let date = now.format("%Y-%m-%d").to_string();
        let now_iso = now.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

        let mut meta = Metadata { updated: now_iso.clone(), ..Default::default() };
        match status {
            Status::Done => meta.done = Some(now_iso.clone()),
            Status::Log => meta.log = Some(now_iso.clone()),
            Status::Todo => {}
        }
        let entry = Entry {
            id: ulid(),
            content: content.trim().to_string(),
            tags: extract_tags(content),
            status,
            date: date.clone(),
            metadata: meta,
        };
        let mut day = self.read_day(&date)?;
        day.insert(0, entry.clone());
        self.write_day(&date, &day)?;
        Ok(entry)
    }

    pub fn update_entry(&self, id: &str, new_content: Option<&str>, new_status: Option<Status>) -> Result<Entry> {
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        for d in self.list_dates()? {
            let mut day = self.read_day(&d)?;
            if let Some(idx) = day.iter().position(|e| e.id == id) {
                let e = &mut day[idx];
                if let Some(c) = new_content {
                    e.content = c.trim().to_string();
                    e.tags = extract_tags(c);
                }
                if let Some(s) = new_status {
                    match &s {
                        Status::Done => e.metadata.done = Some(now.clone()),
                        Status::Log => e.metadata.log = Some(now.clone()),
                        _ => {}
                    }
                    e.status = s;
                }
                e.metadata.updated = now.clone();
                let updated = e.clone();
                self.write_day(&d, &day)?;
                return Ok(updated);
            }
        }
        Err(anyhow!("entry not found: {id}"))
    }

    pub fn delete_entry(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        for d in self.list_dates()? {
            let mut day = self.read_day(&d)?;
            if let Some(idx) = day.iter().position(|e| e.id == id) {
                day[idx].metadata.deleted = Some(now.clone());
                day[idx].metadata.updated = now.clone();
                self.write_day(&d, &day)?;
                return Ok(());
            }
        }
        Err(anyhow!("entry not found: {id}"))
    }

    /// Set or delete a single open metadata field (PRD §4.6.2 / §6.7). A null
    /// value deletes the key. Base fields are managed via status/delete and are
    /// rejected, mirroring `Vault.setProperty` in the TS core.
    pub fn set_property(&self, id: &str, key: &str, value: serde_json::Value) -> Result<Entry> {
        if !is_valid_meta_key(key) {
            return Err(anyhow!("invalid metadata key: {key}"));
        }
        if matches!(key, "done" | "log" | "updated" | "deleted") {
            return Err(anyhow!("\"{key}\" is a managed base field"));
        }
        if !(value.is_string() || value.is_number() || value.is_boolean() || value.is_null()) {
            return Err(anyhow!("metadata value must be a scalar"));
        }
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        for d in self.list_dates()? {
            let mut day = self.read_day(&d)?;
            if let Some(idx) = day.iter().position(|e| e.id == id) {
                let e = &mut day[idx];
                if value.is_null() {
                    e.metadata.extra.remove(key);
                } else {
                    e.metadata.extra.insert(key.to_string(), value);
                }
                e.metadata.updated = now.clone();
                let updated = e.clone();
                self.write_day(&d, &day)?;
                return Ok(updated);
            }
        }
        Err(anyhow!("entry not found: {id}"))
    }
}

/// Strip `_`-prefixed system fields from entries before they reach an AI client
/// (PRD §6.7.2 / §8.3). MCP tool results are AI context too.
pub fn strip_system_fields(mut entries: Vec<Entry>) -> Vec<Entry> {
    for e in &mut entries {
        e.metadata.extra.retain(|k, _| !k.starts_with('_'));
    }
    entries
}

/// Metadata key rules (§6.7.4): start with letter/underscore, then alphanumerics
/// or underscore, ≤40 chars.
fn is_valid_meta_key(key: &str) -> bool {
    if key.is_empty() || key.len() > 40 {
        return false;
    }
    let mut chars = key.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn walkdir(root: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            out.extend(walkdir(&p)?);
        } else {
            out.push(p);
        }
    }
    Ok(out)
}

fn filename_date(name: &str) -> Option<String> {
    if name.len() < 13 { return None; }
    let date = &name[..10];
    if date.chars().enumerate().all(|(i, c)| match i {
        4 | 7 => c == '-',
        _ => c.is_ascii_digit(),
    }) {
        Some(date.to_string())
    } else { None }
}

fn parse_day_file(text: &str, fallback_date: &str) -> Vec<Entry> {
    let mut body = text;
    let mut frontmatter_updated = String::new();
    if let Some(rest) = text.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            for line in fm.lines() {
                if let Some(v) = line.strip_prefix("updatedAt:") {
                    frontmatter_updated = v.trim().to_string();
                }
            }
            body = &rest[end + 4..];
            body = body.trim_start_matches('\n');
        }
    }
    let mut out = Vec::new();
    for line in body.lines() {
        if let Some(e) = parse_entry_line(line, fallback_date, &frontmatter_updated) {
            out.push(e);
        }
    }
    out
}

fn parse_entry_line(line: &str, date: &str, fallback_updated: &str) -> Option<Entry> {
    let line = line.trim_end_matches('\r');
    if line.trim().is_empty() { return None; }
    let (status, mut body) = if let Some(rest) = line.strip_prefix("- [ ] ") {
        (Status::Todo, rest.to_string())
    } else if let Some(rest) = line.strip_prefix("- [x] ").or_else(|| line.strip_prefix("- [X] ")) {
        (Status::Done, rest.to_string())
    } else if let Some(rest) = line.strip_prefix("- ") {
        (Status::Log, rest.to_string())
    } else {
        return None;
    };

    let mut metadata = Metadata { updated: fallback_updated.to_string(), ..Default::default() };

    // strip trailing <!-- ... --> (metadata block)
    if let Some(start) = body.rfind("<!--") {
        if body[start..].trim_end().ends_with("-->") {
            let raw = &body[start + 4..body.rfind("-->").unwrap()];
            let raw = raw.trim();
            if let Ok(v) = serde_json::from_str::<Metadata>(raw) {
                metadata = v;
                if metadata.updated.is_empty() {
                    metadata.updated = fallback_updated.to_string();
                }
            }
            body.truncate(start);
            body = body.trim_end().to_string();
        }
    }

    // strip trailing ^ULID
    let mut id = ulid();
    if let Some(pos) = body.rfind(" ^") {
        let candidate = &body[pos + 2..];
        if candidate.len() == 26 && candidate.chars().all(is_ulid_char) {
            id = candidate.to_string();
            body.truncate(pos);
        }
    }

    let content = body.trim().to_string();
    let tags = extract_tags(&content);
    Some(Entry { id, content, tags, status, date: date.to_string(), metadata })
}

fn serialize_entry(e: &Entry) -> String {
    let prefix = match e.status {
        Status::Todo => "- [ ]",
        Status::Done => "- [x]",
        Status::Log => "-",
    };
    let content = e.content.replace('\n', "\\n");
    let meta = serialize_metadata(&e.metadata);
    if meta.is_empty() {
        format!("{prefix} {content} ^{}", e.id)
    } else {
        format!("{prefix} {content} ^{} {meta}", e.id)
    }
}

/// Serialize metadata to the `<!-- {...} -->` block. Key order MUST match the
/// TS serializer (`packages/core/src/metadata.ts` orderedMetaEntries): base
/// keys first in fixed order (done, log, updated, deleted), then all extra keys
/// sorted alphabetically. Identical byte output across engines is what keeps
/// cross-engine edits from looking like content changes to sync.
fn serialize_metadata(m: &Metadata) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(v) = &m.done { parts.push(kv("done", &json_str(v))); }
    if let Some(v) = &m.log { parts.push(kv("log", &json_str(v))); }
    if !m.updated.is_empty() { parts.push(kv("updated", &json_str(&m.updated))); }
    if let Some(v) = &m.deleted { parts.push(kv("deleted", &json_str(v))); }
    let mut keys: Vec<&String> = m.extra.keys().collect();
    keys.sort();
    for k in keys {
        parts.push(kv(k, &m.extra[k]));
    }
    if parts.is_empty() { return String::new(); }
    format!("<!-- {{{}}} -->", parts.join(","))
}

/// `"key":value` with JSON-correct escaping for both, matching JSON.stringify.
fn kv(k: &str, v: &serde_json::Value) -> String {
    format!("{}:{}", serde_json::to_string(k).unwrap(), serde_json::to_string(v).unwrap())
}

fn json_str(s: &str) -> serde_json::Value { serde_json::Value::String(s.to_string()) }

fn extract_tags(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' && (i == 0 || bytes[i - 1].is_ascii_whitespace()) {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j] != b' ' && bytes[j] != b'\t' && bytes[j] != b'#' {
                j += 1;
            }
            let tag = std::str::from_utf8(&bytes[i + 1..j]).unwrap_or("");
            if !tag.is_empty() && !tag.chars().all(|c| c.is_ascii_digit()) && !out.iter().any(|t| t == tag) {
                out.push(tag.to_string());
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

fn is_ulid_char(c: char) -> bool {
    match c {
        '0'..='9' => true,
        'A'..='H' | 'J' | 'K' | 'M' | 'N' | 'P'..='T' | 'V'..='Z' => true,
        _ => false,
    }
}

fn ulid() -> String {
    use rand::Rng;
    const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut s = String::with_capacity(26);
    let mut t: u64 = chrono::Utc::now().timestamp_millis() as u64;
    let mut time_chars = [0u8; 10];
    for slot in time_chars.iter_mut().rev() {
        *slot = ALPHABET[(t % 32) as usize];
        t /= 32;
    }
    for &c in &time_chars { s.push(c as char); }
    let mut rng = rand::thread_rng();
    for _ in 0..16 {
        s.push(ALPHABET[rng.gen_range(0..32)] as char);
    }
    s
}

pub fn parse_status(s: &str) -> Option<Status> {
    match s {
        "todo" => Some(Status::Todo),
        "done" => Some(Status::Done),
        "log" => Some(Status::Log),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const D: &str = "2026-05-18";
    const T: &str = "2026-05-18T00:00:00Z";

    #[test]
    fn extract_tags_basic() {
        assert_eq!(extract_tags("a #b #c"), vec!["b", "c"]);
    }

    #[test]
    fn extract_tags_rejects_digits_only() {
        assert_eq!(extract_tags("#1 priority #work"), vec!["work"]);
    }

    #[test]
    fn extract_tags_no_space() {
        assert!(extract_tags("foo#bar").is_empty());
    }

    #[test]
    fn extract_tags_cjk() {
        assert_eq!(extract_tags("做了 #工作 #健康"), vec!["工作", "健康"]);
    }

    #[test]
    fn parse_entry_line_todo() {
        let e = parse_entry_line(
            "- [ ] 买牛奶 #生活 ^01HXYZABCD1234567890ABCDEF",
            D, T,
        ).unwrap();
        assert!(matches!(e.status, Status::Todo));
        assert_eq!(e.content, "买牛奶 #生活");
        assert_eq!(e.tags, vec!["生活"]);
        assert_eq!(e.id, "01HXYZABCD1234567890ABCDEF");
    }

    #[test]
    fn parse_entry_line_done_with_meta() {
        let e = parse_entry_line(
            r#"- [x] 跑步 ^01HXYZABCD1234567890ABCDEF <!-- {"done":"2026-05-18T08:30:00Z","updated":"2026-05-18T08:30:00Z"} -->"#,
            D, T,
        ).unwrap();
        assert!(matches!(e.status, Status::Done));
        assert_eq!(e.metadata.done.as_deref(), Some("2026-05-18T08:30:00Z"));
    }

    #[test]
    fn parse_entry_line_log() {
        let e = parse_entry_line("- 看书 #读书 ^01HXYZABCD1234567890ABCDEF", D, T).unwrap();
        assert!(matches!(e.status, Status::Log));
        assert_eq!(e.tags, vec!["读书"]);
    }

    #[test]
    fn parse_entry_line_broken_meta_kept_content() {
        let e = parse_entry_line(
            "- [ ] 内容 ^01HXYZABCD1234567890ABCDEF <!-- 损坏的 json -->",
            D, T,
        ).unwrap();
        assert_eq!(e.content, "内容");
    }

    #[test]
    fn parse_entry_line_backfills_id() {
        let e = parse_entry_line("- [ ] no id task", D, T).unwrap();
        assert_eq!(e.id.len(), 26);
        assert_eq!(e.content, "no id task");
    }

    #[test]
    fn serialize_entry_roundtrip_todo() {
        let e = Entry {
            id: "01HXYZABCD1234567890ABCDEF".to_string(),
            content: "买牛奶 #生活".to_string(),
            tags: vec!["生活".into()],
            status: Status::Todo,
            date: D.into(),
            metadata: Metadata { updated: "2026-05-18T09:00:00Z".into(), ..Default::default() },
        };
        let line = serialize_entry(&e);
        let parsed = parse_entry_line(&line, D, T).unwrap();
        assert_eq!(parsed.id, e.id);
        assert_eq!(parsed.content, e.content);
        assert!(matches!(parsed.status, Status::Todo));
        assert_eq!(parsed.metadata.updated, "2026-05-18T09:00:00Z");
    }

    #[test]
    fn filename_date_parses() {
        assert_eq!(filename_date("2026-05-18.md"), Some("2026-05-18".to_string()));
        assert_eq!(filename_date("README.md"), None);
    }

    #[test]
    fn vault_create_list_complete_delete_round_trip() {
        let dir = tempdir().unwrap();
        let vault = Vault::new(dir.path().to_path_buf());
        let e = vault.create_entry("task #x", Status::Todo).unwrap();
        let listed = vault.list_entries(None, None, None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].content, "task #x");
        assert_eq!(listed[0].tags, vec!["x"]);

        let done = vault.update_entry(&e.id, None, Some(Status::Done)).unwrap();
        assert!(matches!(done.status, Status::Done));
        assert!(done.metadata.done.is_some());

        vault.delete_entry(&e.id).unwrap();
        let after = vault.list_entries(None, None, None).unwrap();
        assert!(after.is_empty(), "tombstoned entries excluded from list");
    }

    #[test]
    fn vault_search_by_tag() {
        let dir = tempdir().unwrap();
        let vault = Vault::new(dir.path().to_path_buf());
        vault.create_entry("first #work", Status::Todo).unwrap();
        vault.create_entry("second #home", Status::Todo).unwrap();
        let r = vault.search("work", 10).unwrap();
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn metadata_preserves_unknown_keys() {
        // Regression for the unknown-key drop bug: rewriting an entry that has
        // arbitrary fields (e.g. `due`) must not discard them.
        let line = r#"- [ ] task ^01HXYZABCD1234567890ABCDEF <!-- {"updated":"U","due":"2026-05-25","project":"q3"} -->"#;
        let e = parse_entry_line(line, D, T).unwrap();
        assert_eq!(e.metadata.extra.get("due").unwrap(), "2026-05-25");
        let reparsed = parse_entry_line(&serialize_entry(&e), D, T).unwrap();
        assert_eq!(reparsed.metadata.extra.get("due").unwrap(), "2026-05-25");
        assert_eq!(reparsed.metadata.extra.get("project").unwrap(), "q3");
    }

    #[test]
    fn serialize_metadata_matches_ts_key_order() {
        // Base keys in fixed order (done, log, updated, deleted), then extras
        // sorted — byte-identical to the TS serializer.
        let mut extra = serde_json::Map::new();
        extra.insert("priority".into(), serde_json::json!(2));
        extra.insert("due".into(), serde_json::json!("2026-05-25"));
        let m = Metadata {
            updated: "U".into(),
            deleted: Some("D".into()),
            extra,
            ..Default::default()
        };
        assert_eq!(
            serialize_metadata(&m),
            r#"<!-- {"updated":"U","deleted":"D","due":"2026-05-25","priority":2} -->"#,
        );
    }

    #[test]
    fn set_property_sets_and_deletes() {
        let dir = tempdir().unwrap();
        let vault = Vault::new(dir.path().to_path_buf());
        let e = vault.create_entry("task", Status::Todo).unwrap();
        let set = vault.set_property(&e.id, "due", serde_json::json!("2026-05-25")).unwrap();
        assert_eq!(set.metadata.extra.get("due").unwrap(), "2026-05-25");
        let cleared = vault.set_property(&e.id, "due", serde_json::Value::Null).unwrap();
        assert!(cleared.metadata.extra.get("due").is_none());
        // base fields rejected
        assert!(vault.set_property(&e.id, "done", serde_json::json!("x")).is_err());
        assert!(vault.set_property(&e.id, "a-b", serde_json::json!("x")).is_err());
    }

    #[test]
    fn strip_system_fields_removes_underscored() {
        let line = r#"- [ ] task ^01HXYZABCD1234567890ABCDEF <!-- {"updated":"U","due":"D","_conflict":true} -->"#;
        let e = parse_entry_line(line, D, T).unwrap();
        let stripped = strip_system_fields(vec![e]).pop().unwrap();
        assert!(stripped.metadata.extra.get("_conflict").is_none());
        assert_eq!(stripped.metadata.extra.get("due").unwrap(), "D");
    }
}

