// Tauri 2 entry point. Vault file IO is handled in JS via @tauri-apps/plugin-fs.
// Native commands here are limited to operations awkward to do from JS, like
// zipping the vault directory for the "Export" action (PRD §4.5.4).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![export_vault])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
