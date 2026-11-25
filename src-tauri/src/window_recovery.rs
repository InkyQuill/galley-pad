use std::{
    fs,
    io::{self, BufWriter, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, WebviewWindow};

use super::{app_config_file, MAIN_WINDOW_LABEL};

pub(super) fn swap_path(app: &AppHandle, label: &str) -> Result<PathBuf, String> {
    app_config_file(app, &format!("swap-{label}.json"))
}

fn use_legacy_swap(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL
}

fn read_snapshot(path: &Path) -> Result<Option<serde_json::Value>, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read recovery snapshot '{}': {error}",
                path.display()
            ))
        }
    };
    serde_json::from_str(&content).map(Some).map_err(|error| {
        format!(
            "Failed to parse recovery snapshot '{}': {error}",
            path.display()
        )
    })
}

pub(super) fn recovery_window_labels(app: &AppHandle) -> Result<Vec<String>, String> {
    let main_path = swap_path(app, MAIN_WINDOW_LABEL)?;
    let directory = main_path.parent().expect("config file has a parent");
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to read recovery directory: {error}")),
    };
    Ok(entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| recovery_label(&entry.file_name().to_string_lossy()).map(str::to_owned))
        .collect())
}

fn recovery_label(name: &str) -> Option<&str> {
    let label = name.strip_prefix("swap-")?.strip_suffix(".json")?;
    let index = label.strip_prefix("markdown-file-")?;
    if index.is_empty() || !index.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(label)
}

fn remove_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear recovery snapshot '{}': {error}",
            path.display()
        )),
    }
}

fn write_snapshot(path: &Path, state: &serde_json::Value) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or("Recovery snapshot has no parent directory")?;
    let mut builder = tempfile::Builder::new();
    builder.prefix(".swap-").suffix(".tmp");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o600));
    }
    let mut temporary = builder.tempfile_in(directory).map_err(|error| {
        format!(
            "Failed to create temporary recovery file '{}': {error}",
            path.display()
        )
    })?;
    {
        let mut output = BufWriter::new(temporary.as_file_mut());
        serde_json::to_writer(&mut output, state).map_err(|error| {
            format!(
                "Failed to write recovery snapshot '{}': {error}",
                path.display()
            )
        })?;
        output.flush().map_err(|error| {
            format!(
                "Failed to flush recovery snapshot '{}': {error}",
                path.display()
            )
        })?;
    }
    temporary.as_file().sync_all().map_err(|error| {
        format!(
            "Failed to sync recovery snapshot '{}': {error}",
            path.display()
        )
    })?;
    temporary.persist(path).map_err(|error| {
        format!(
            "Failed to replace recovery snapshot '{}': {error}",
            path.display()
        )
    })?;
    Ok(())
}

#[tauri::command]
pub(super) async fn read_swap_state(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<serde_json::Value>, String> {
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let scoped = read_snapshot(&swap_path(&app, &label)?)?;
        if scoped.is_some() || !use_legacy_swap(&label) {
            return Ok(scoped);
        }
        read_snapshot(&app_config_file(&app, "swap.json")?)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(super) async fn write_swap_state(
    app: AppHandle,
    window: WebviewWindow,
    state: serde_json::Value,
) -> Result<(), String> {
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        write_snapshot(&swap_path(&app, &label)?, &state)?;
        if use_legacy_swap(&label) {
            remove_if_present(&app_config_file(&app, "swap.json")?)?;
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(super) async fn clear_swap_state(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        remove_if_present(&swap_path(&app, &label)?)?;
        if use_legacy_swap(&label) {
            remove_if_present(&app_config_file(&app, "swap.json")?)?;
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_window_snapshots_are_used_to_reopen_secondary_windows() {
        assert_eq!(
            recovery_label("swap-markdown-file-7.json"),
            Some("markdown-file-7")
        );
        for name in [
            "swap.json",
            "swap-main.json",
            "settings.json",
            "swap-markdown-file-7.json.tmp",
            "swap-markdown-file-.json",
            "swap-markdown-file-injected.json",
        ] {
            assert_eq!(recovery_label(name), None);
        }
    }

    #[cfg(unix)]
    #[test]
    fn snapshot_replaces_preexisting_permissions_with_owner_only_access() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("swap-main.json");
        fs::write(&path, "{}").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        write_snapshot(&path, &serde_json::json!({ "content": "private" })).unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn clearing_one_window_keeps_other_dirty_snapshots() {
        let directory = tempfile::tempdir().unwrap();
        let first = directory.path().join("swap-main.json");
        let second = directory.path().join("swap-markdown-file-1.json");
        let a = serde_json::json!({ "content": "first window" });
        let b = serde_json::json!({ "content": "second window" });
        write_snapshot(&first, &a).unwrap();
        write_snapshot(&second, &b).unwrap();
        remove_if_present(&first).unwrap();
        assert_eq!(read_snapshot(&first).unwrap(), None);
        assert_eq!(read_snapshot(&second).unwrap(), Some(b));
    }
}
