use serde::Serialize;
use std::{
    ffi::{OsStr, OsString},
    fs,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(desktop)]
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;
#[cfg(desktop)]
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

const MARKDOWN_FILE_OPENED_EVENT: &str = "markdown-file-opened";
const APP_MENU_COMMAND_EVENT: &str = "app-menu-command";
const MENU_NEW_ID: &str = "app-menu-new";
const MENU_OPEN_ID: &str = "app-menu-open";
const MENU_SAVE_ID: &str = "app-menu-save";
const MENU_SAVE_AS_ID: &str = "app-menu-save-as";
const MENU_TOGGLE_TOOLBAR_ID: &str = "app-menu-toggle-toolbar";
const MENU_SETTINGS_ID: &str = "app-menu-settings";
const MAIN_WINDOW_LABEL: &str = "main";
static MARKDOWN_WINDOW_INDEX: AtomicU64 = AtomicU64::new(1);

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

struct PendingMarkdownFileOpen(Mutex<Option<String>>);

#[tauri::command]
fn take_pending_markdown_file_open(
    state: tauri::State<'_, PendingMarkdownFileOpen>,
) -> Option<String> {
    state.0.lock().ok()?.take()
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

fn first_markdown_path_from_args(args: &[OsString]) -> Option<String> {
    args.iter()
        .skip(1)
        .find_map(|arg| markdown_path_from_os_arg(arg))
}

fn markdown_paths_from_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|arg| {
            let path = Path::new(arg);
            is_markdown_path(path).then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

fn markdown_path_from_os_arg(arg: &OsStr) -> Option<String> {
    let path = Path::new(arg);
    is_markdown_path(path).then(|| path.to_string_lossy().into_owned())
}

fn markdown_paths_from_urls(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| {
            if url.scheme() != "file" {
                return None;
            }

            url.to_file_path().ok()
        })
        .filter(|path| is_markdown_path(path))
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn markdown_window_label(index: u64) -> String {
    format!("markdown-file-{index}")
}

fn markdown_window_url(path: &str) -> String {
    format!("index.html?open={}", percent_encode_query_value(path))
}

fn percent_encode_query_value(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::new();

    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/') {
            encoded.push(*byte as char);
        } else {
            encoded.push('%');
            encoded.push(HEX[(byte >> 4) as usize] as char);
            encoded.push(HEX[(byte & 0x0f) as usize] as char);
        }
    }

    encoded
}

#[cfg(desktop)]
#[tauri::command]
fn open_markdown_file_window(app: AppHandle, path: String) -> Result<String, String> {
    let label = markdown_window_label(MARKDOWN_WINDOW_INDEX.fetch_add(1, Ordering::Relaxed));
    let url = markdown_window_url(&path);

    WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .title(app_title())
        .inner_size(980.0, 720.0)
        .min_inner_size(640.0, 420.0)
        .resizable(true)
        .build()
        .map_err(|error| format!("Failed to open '{path}' in a new window: {error}"))?;

    Ok(label)
}

fn menu_command_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        MENU_NEW_ID => Some("new"),
        MENU_OPEN_ID => Some("open"),
        MENU_SAVE_ID => Some("save"),
        MENU_SAVE_AS_ID => Some("save-as"),
        MENU_TOGGLE_TOOLBAR_ID => Some("toggle-toolbar"),
        MENU_SETTINGS_ID => Some("settings"),
        _ => None,
    }
}

#[cfg(desktop)]
fn build_native_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, MENU_NEW_ID, "New", true, Some("CmdOrCtrl+N"))?,
                    &MenuItem::with_id(app, MENU_OPEN_ID, "Open...", true, Some("CmdOrCtrl+O"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, MENU_SAVE_ID, "Save", true, Some("CmdOrCtrl+S"))?,
                    &MenuItem::with_id(
                        app,
                        MENU_SAVE_AS_ID,
                        "Save As...",
                        true,
                        Some("CmdOrCtrl+Shift+S"),
                    )?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &MenuItem::with_id(
                        app,
                        MENU_TOGGLE_TOOLBAR_ID,
                        "Toggle Editor Toolbar",
                        true,
                        Some("CmdOrCtrl+Shift+T"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_SETTINGS_ID,
                        "Settings...",
                        true,
                        Some("CmdOrCtrl+,"),
                    )?,
                ],
            )?,
        ],
    )
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

    let args = std::env::args_os().collect::<Vec<_>>();
    let pending_markdown_file_open =
        PendingMarkdownFileOpen(Mutex::new(first_markdown_path_from_args(&args)));

    let app = tauri::Builder::default()
        .manage(pending_markdown_file_open)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for path in markdown_paths_from_args(&args) {
                let _ = app.emit_to(MAIN_WINDOW_LABEL, MARKDOWN_FILE_OPENED_EVENT, path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .menu(build_native_menu)
        .on_menu_event(|app, event| {
            if let Some(command) = menu_command_payload(event.id().as_ref()) {
                let _ = app.emit(APP_MENU_COMMAND_EVENT, command);
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            take_pending_markdown_file_open,
            open_markdown_file_window
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while building {}: {error}", app_title()));

    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = event {
            for path in markdown_paths_from_urls(&urls) {
                let _ = app.emit_to(MAIN_WINDOW_LABEL, MARKDOWN_FILE_OPENED_EVENT, path);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::app_title;
    use std::ffi::OsString;
    use tauri::Url;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[test]
    fn first_markdown_path_from_args_ignores_non_markdown_values() {
        let args = vec![
            OsString::from("galley-pad"),
            OsString::from("--flag"),
            OsString::from("/tmp/notes.txt"),
            OsString::from("/tmp/draft.markdown"),
            OsString::from("/tmp/other.md"),
        ];

        assert_eq!(
            super::first_markdown_path_from_args(&args),
            Some("/tmp/draft.markdown".to_string())
        );
    }

    #[test]
    fn markdown_paths_from_args_accepts_all_markdown_file_args() {
        let args = vec![
            "gpad".to_string(),
            "--flag".to_string(),
            "/tmp/one.md".to_string(),
            "/tmp/notes.txt".to_string(),
            "/tmp/two.markdown".to_string(),
        ];

        assert_eq!(
            super::markdown_paths_from_args(&args),
            vec!["/tmp/one.md".to_string(), "/tmp/two.markdown".to_string()]
        );
    }

    #[test]
    fn markdown_paths_from_urls_accepts_file_urls_only() {
        let urls = vec![
            Url::parse("https://example.com/readme.md").expect("parse https url"),
            Url::from_file_path("/tmp/README.MD").expect("create file url"),
            Url::from_file_path("/tmp/notes.txt").expect("create file url"),
        ];

        assert_eq!(
            super::markdown_paths_from_urls(&urls),
            vec!["/tmp/README.MD".to_string()]
        );
    }

    #[test]
    fn menu_command_payload_maps_known_native_menu_ids() {
        assert_eq!(super::menu_command_payload(super::MENU_NEW_ID), Some("new"));
        assert_eq!(
            super::menu_command_payload(super::MENU_OPEN_ID),
            Some("open")
        );
        assert_eq!(
            super::menu_command_payload(super::MENU_SAVE_ID),
            Some("save")
        );
        assert_eq!(
            super::menu_command_payload(super::MENU_SAVE_AS_ID),
            Some("save-as")
        );
        assert_eq!(
            super::menu_command_payload(super::MENU_TOGGLE_TOOLBAR_ID),
            Some("toggle-toolbar")
        );
        assert_eq!(
            super::menu_command_payload(super::MENU_SETTINGS_ID),
            Some("settings")
        );
        assert_eq!(super::menu_command_payload("unknown"), None);
    }

    #[test]
    fn markdown_window_label_uses_monotonic_index() {
        assert_eq!(super::markdown_window_label(7), "markdown-file-7");
    }

    #[test]
    fn markdown_window_url_encodes_file_path_query() {
        assert_eq!(
            super::markdown_window_url("/tmp/a draft #1.md"),
            "index.html?open=/tmp/a%20draft%20%231.md"
        );
        assert_eq!(
            super::markdown_window_url("/tmp/Привет.md"),
            "index.html?open=/tmp/%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82.md"
        );
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
