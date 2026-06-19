use serde::Serialize;
use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

fn app_title() -> &'static str {
    "Galley Pad"
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub content: String,
    pub line_ending: LineEnding,
    pub last_modified_at: Option<u64>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    pub path: String,
    pub line_ending: LineEnding,
    pub last_modified_at: Option<u64>,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<FileReadResult, String> {
    read_text_file_from_path(path)
}

pub fn read_text_file_from_path(path: String) -> Result<FileReadResult, String> {
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read text file '{path}': {error}"))?;
    let last_modified_at = last_modified_at_ms(&path)?;

    Ok(FileReadResult {
        path,
        line_ending: detect_line_ending(&content),
        content,
        last_modified_at,
    })
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<FileWriteResult, String> {
    write_text_file_to_path(path, content)
}

pub fn write_text_file_to_path(path: String, content: String) -> Result<FileWriteResult, String> {
    fs::write(&path, &content)
        .map_err(|error| format!("Failed to write text file '{path}': {error}"))?;
    let last_modified_at = last_modified_at_ms(&path)?;

    Ok(FileWriteResult {
        path,
        line_ending: detect_line_ending(&content),
        last_modified_at,
    })
}

fn detect_line_ending(content: &str) -> LineEnding {
    if content.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    }
}

fn last_modified_at_ms(path: &str) -> Result<Option<u64>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read metadata for '{path}': {error}"))?;

    match metadata.modified() {
        Ok(modified) => Ok(system_time_to_ms(modified)),
        Err(_) => Ok(None),
    }
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

#[cfg(target_os = "linux")]
fn should_disable_dmabuf_renderer(
    wayland_display_present: bool,
    dmabuf_renderer_configured: bool,
) -> bool {
    wayland_display_present && !dmabuf_renderer_configured
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_wayland_renderer() {
    if should_disable_dmabuf_renderer(
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_wayland_renderer();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {}: {error}", app_title()));
}

#[cfg(test)]
mod tests {
    use super::app_title;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_wayland_disables_dmabuf_renderer_when_unconfigured() {
        assert!(super::should_disable_dmabuf_renderer(true, false));
        assert!(!super::should_disable_dmabuf_renderer(true, true));
        assert!(!super::should_disable_dmabuf_renderer(false, false));
    }

    #[test]
    fn read_text_file_returns_content_metadata_and_line_ending() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("draft.md");
        std::fs::write(&path, "# Draft\r\n\r\nBody\r\n").expect("write test markdown");

        let result = super::read_text_file_from_path(path.to_string_lossy().into_owned())
            .expect("read text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.content, "# Draft\r\n\r\nBody\r\n");
        assert_eq!(result.line_ending, super::LineEnding::Crlf);
        assert!(result.last_modified_at.is_some());
    }

    #[test]
    fn write_text_file_writes_content_and_returns_metadata() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("saved.md");

        let result = super::write_text_file_to_path(
            path.to_string_lossy().into_owned(),
            "Saved\nText\n".to_string(),
        )
        .expect("write text file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.line_ending, super::LineEnding::Lf);
        assert!(result.last_modified_at.is_some());
        assert_eq!(
            std::fs::read_to_string(path).expect("read saved file"),
            "Saved\nText\n"
        );
    }
}
