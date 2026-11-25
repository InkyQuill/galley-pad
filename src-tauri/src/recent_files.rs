use std::{path::Path, sync::Mutex};
use tauri::{AppHandle, State};

use super::{app_config_file, read_json_or_quarantine, write_json_file};

const MAX_RECENT_FILES: usize = 12;

#[derive(Default)]
pub(super) struct RecentFiles(Mutex<()>);

fn read(path: &Path) -> Result<Vec<String>, String> {
    Ok(read_json_or_quarantine(path)?.unwrap_or_default())
}

fn update(mut recent: Vec<String>, path: String, remember: bool) -> Vec<String> {
    recent.retain(|existing| *existing != path);
    if remember {
        recent.insert(0, path);
        recent.truncate(MAX_RECENT_FILES);
    }
    recent
}

#[tauri::command]
pub(super) fn read_recent_files(
    app: AppHandle,
    files: State<'_, RecentFiles>,
) -> Result<Vec<String>, String> {
    let _guard = files.0.lock().map_err(|_| "Recent files are unavailable")?;
    read(&app_config_file(&app, "recent-files.json")?)
}

#[tauri::command]
pub(super) fn update_recent_file(
    app: AppHandle,
    files: State<'_, RecentFiles>,
    path: String,
    remember: bool,
) -> Result<(), String> {
    let _guard = files.0.lock().map_err(|_| "Recent files are unavailable")?;
    let storage = app_config_file(&app, "recent-files.json")?;
    let next = update(read(&storage)?, path, remember);
    write_json_file(&storage, &next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn corrupt_recent_files_are_preserved_and_read_as_empty() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("recent-files.json");
        fs::write(&path, "{broken").unwrap();
        assert!(read(&path).unwrap().is_empty());
        assert!(fs::read_dir(directory.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.path() != path
                && fs::read_to_string(entry.path()).unwrap() == "{broken"));
    }

    #[test]
    fn recent_files_are_unique_bounded_and_remove_stale_entries() {
        let paths = (0..20).map(|index| format!("/drafts/{index}.md")).collect();
        let recent = update(paths, "/drafts/10.md".into(), true);
        assert_eq!(recent.len(), MAX_RECENT_FILES);
        assert_eq!(recent[0], "/drafts/10.md");
        assert_eq!(
            recent
                .iter()
                .filter(|path| *path == "/drafts/10.md")
                .count(),
            1
        );
        assert!(!update(recent, "/drafts/10.md".into(), false)
            .iter()
            .any(|path| path == "/drafts/10.md"));
    }
}
