use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    ffi::{OsStr, OsString},
    fs,
    io::{ErrorKind, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

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

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    pub family: String,
    pub css_value: String,
    pub monospaced: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontCatalog {
    pub fonts: Vec<SystemFont>,
    pub locale: Option<String>,
    pub preview_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPersistedAppSettings {
    pub appearance_theme: Option<String>,
    pub theme_settings: Option<serde_json::Value>,
    pub editor_font_family: Option<String>,
    pub editor_font_size: Option<String>,
    pub open_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    Constant,
    System,
    Native,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    pub mode: ThemeMode,
    pub constant_theme_id: String,
    pub light_theme_id: String,
    pub dark_theme_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppSettings {
    pub appearance_theme: Option<String>,
    pub theme_settings: Option<ThemeSettings>,
    pub editor_font_family: Option<String>,
    pub editor_font_size: Option<String>,
    pub open_mode: Option<String>,
}

struct PendingMarkdownFileOpen(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_markdown_file_opens(
    state: tauri::State<'_, PendingMarkdownFileOpen>,
) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut paths| std::mem::take(&mut *paths))
        .unwrap_or_default()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<FileReadResult, String> {
    read_text_file_from_path(path)
}

pub fn read_text_file_from_path(path: String) -> Result<FileReadResult, String> {
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(FileReadResult {
                path,
                line_ending: LineEnding::Lf,
                content: String::new(),
                last_modified_at: None,
            });
        }
        Err(error) => return Err(format!("Failed to read text file '{path}': {error}")),
    };
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

#[tauri::command]
fn list_system_fonts() -> SystemFontCatalog {
    list_system_fonts_catalog()
}

#[tauri::command]
fn read_app_settings(app: AppHandle) -> Result<Option<RawPersistedAppSettings>, String> {
    let path = app_config_file(&app, "settings.json")?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read app settings '{}': {error}", path.display()))?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("Failed to parse app settings '{}': {error}", path.display()))
}

#[tauri::command]
fn write_app_settings(app: AppHandle, settings: PersistedAppSettings) -> Result<(), String> {
    write_json_file(&app_config_file(&app, "settings.json")?, &settings)
}

#[tauri::command]
fn read_swap_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = app_config_file(&app, "swap.json")?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read swap state '{}': {error}", path.display()))?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("Failed to parse swap state '{}': {error}", path.display()))
}

#[tauri::command]
fn write_swap_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    write_json_file(&app_config_file(&app, "swap.json")?, &state)
}

#[tauri::command]
fn clear_swap_state(app: AppHandle) -> Result<(), String> {
    let path = app_config_file(&app, "swap.json")?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to clear swap state '{}': {error}",
            path.display()
        )),
    }
}

pub fn list_system_fonts_catalog() -> SystemFontCatalog {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    let mut families = BTreeMap::<String, SystemFont>::new();
    for face in database.faces() {
        let Some((family, _)) = face.families.first() else {
            continue;
        };
        let trimmed = family.trim();
        if trimmed.is_empty() {
            continue;
        }

        let key = trimmed.to_lowercase();
        families.entry(key).or_insert_with(|| SystemFont {
            family: trimmed.to_string(),
            css_value: format!("{}, {}", quote_css_font_family(trimmed), "sans-serif"),
            monospaced: face.monospaced,
        });
    }

    let locale = sys_locale::get_locale();
    let preview_text = localized_font_preview_text(locale.as_deref()).to_string();

    SystemFontCatalog {
        fonts: families.into_values().collect(),
        locale,
        preview_text,
    }
}

fn detect_line_ending(content: &str) -> LineEnding {
    if content.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    }
}

fn app_config_file(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to locate app config directory: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Failed to create app config directory '{}': {error}",
            directory.display()
        )
    })?;
    Ok(directory.join(file_name))
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize '{}': {error}", path.display()))?;
    let directory = path.parent().ok_or_else(|| {
        format!(
            "Failed to determine parent directory for '{}'",
            path.display()
        )
    })?;
    fs::create_dir_all(directory).map_err(|error| {
        format!(
            "Failed to create parent directory '{}': {error}",
            directory.display()
        )
    })?;
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("settings.json");
    let temp_path = directory.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    ));

    let write_result = (|| -> Result<(), String> {
        let mut temp_file = fs::File::create(&temp_path).map_err(|error| {
            format!(
                "Failed to create temporary file '{}': {error}",
                temp_path.display()
            )
        })?;
        temp_file.write_all(content.as_bytes()).map_err(|error| {
            format!(
                "Failed to write temporary file '{}': {error}",
                temp_path.display()
            )
        })?;
        temp_file.sync_all().map_err(|error| {
            format!(
                "Failed to sync temporary file '{}': {error}",
                temp_path.display()
            )
        })?;
        drop(temp_file);

        fs::rename(&temp_path, path).map_err(|error| {
            format!(
                "Failed to replace '{}' with '{}': {error}",
                path.display(),
                temp_path.display()
            )
        })
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn quote_css_font_family(family: &str) -> String {
    format!("\"{}\"", family.replace('\\', "\\\\").replace('"', "\\\""))
}

fn localized_font_preview_text(locale: Option<&str>) -> &'static str {
    let language = locale
        .and_then(|value| value.split(['-', '_']).next())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match language.as_str() {
        "ru" | "be" | "bg" | "kk" | "ky" | "mk" | "mn" | "sr" | "tg" | "uk" => {
            "Aa Bb Cc Аа Бб Вв 0123456789 Съешь ещё этих мягких булок"
        }
        _ => "Aa Bb Cc 0123456789 The quick brown fox",
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

fn markdown_paths_from_os_args(args: &[OsString], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|arg| markdown_path_from_os_arg(arg, cwd))
        .collect()
}

fn markdown_paths_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter_map(|arg| {
            let path = Path::new(arg);
            markdown_path_from_path_arg(path, cwd)
        })
        .collect()
}

fn markdown_path_from_os_arg(arg: &OsStr, cwd: &Path) -> Option<String> {
    let path = Path::new(arg);
    markdown_path_from_path_arg(path, cwd)
}

fn markdown_path_from_path_arg(path: &Path, cwd: &Path) -> Option<String> {
    is_markdown_path(path).then(|| {
        absolute_path_from_arg(path, cwd)
            .to_string_lossy()
            .into_owned()
    })
}

fn absolute_path_from_arg(path: &Path, cwd: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };

    normalize_path(&absolute)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    let mut absolute = false;

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => {
                normalized.push(component.as_os_str());
                absolute = true;
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if absolute && normalized.parent().is_none() {
                    continue;
                }

                if !normalized.pop() {
                    normalized.push(component.as_os_str());
                }
            }
            Component::Normal(part) => normalized.push(part),
        }
    }

    normalized
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android", test))]
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

fn queue_pending_markdown_file_open<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let state = app
        .try_state::<PendingMarkdownFileOpen>()
        .ok_or_else(|| "Pending Markdown file state is not available".to_string())?;
    state
        .0
        .lock()
        .map_err(|_| "Pending Markdown file state is unavailable".to_string())?
        .push(path);
    Ok(())
}

fn emit_or_queue_markdown_file_open<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: String,
) -> Result<(), String> {
    let windows = app.webview_windows();
    let target = windows
        .get(MAIN_WINDOW_LABEL)
        .or_else(|| windows.values().next());

    if let Some(window) = target {
        if let Err(error) = window.emit(MARKDOWN_FILE_OPENED_EVENT, path.clone()) {
            let emit_error = format!("Failed to emit Markdown file open event: {error}");
            queue_pending_markdown_file_open(app, path)
                .map_err(|queue_error| format!("{emit_error}; {queue_error}"))?;
            Err(emit_error)
        } else {
            Ok(())
        }
    } else {
        queue_pending_markdown_file_open(app, path)
    }
}

fn emit_app_menu_command<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    command: &str,
) -> Result<(), String> {
    let windows = app.webview_windows();
    let target = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| windows.get(MAIN_WINDOW_LABEL))
        .or_else(|| windows.values().next())
        .ok_or_else(|| "No window is available to receive the menu command".to_string())?;

    target
        .emit(APP_MENU_COMMAND_EVENT, command)
        .map_err(|error| format!("Failed to emit app menu command event: {error}"))
}

#[cfg(desktop)]
fn build_native_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    #[cfg(target_os = "macos")]
    let pkg_info = app.package_info();
    #[cfg(target_os = "macos")]
    let config = app.config();
    #[cfg(target_os = "macos")]
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
    effective_wayland_backend: bool,
    dmabuf_renderer_configured: bool,
) -> bool {
    effective_wayland_backend && !dmabuf_renderer_configured
}

#[cfg(target_os = "linux")]
fn should_supervise_linux_display_backend(
    display_child: bool,
    gdk_backend_configured: bool,
    wayland_display_present: bool,
    x11_display_present: bool,
) -> bool {
    !display_child && !gdk_backend_configured && wayland_display_present && x11_display_present
}

#[cfg(target_os = "linux")]
fn should_disable_compositing_mode(
    effective_wayland_backend: bool,
    compositing_mode_configured: bool,
) -> bool {
    effective_wayland_backend && !compositing_mode_configured
}

#[cfg(target_os = "linux")]
fn configure_linux_display_backend() {
    let effective_wayland_backend = std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("GDK_BACKEND").is_none_or(|backend| backend != "x11");

    if should_disable_dmabuf_renderer(
        effective_wayland_backend,
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    if should_disable_compositing_mode(
        effective_wayland_backend,
        std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

#[cfg(target_os = "linux")]
enum LinuxDisplayChildStatus {
    Started(std::process::ExitStatus),
    ExitedBeforeReady(std::process::ExitStatus),
}

#[cfg(target_os = "linux")]
fn run_with_linux_display_supervisor_if_needed() -> Option<i32> {
    if !should_supervise_linux_display_backend(
        std::env::var_os("GALLEY_PAD_DISPLAY_CHILD").is_some(),
        std::env::var_os("GDK_BACKEND").is_some(),
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("DISPLAY").is_some(),
    ) {
        return None;
    }

    let wayland_status = match run_linux_display_child("wayland") {
        Ok(status) => status,
        Err(error) => {
            eprintln!("{error}");
            return None;
        }
    };
    if !should_retry_x11_after_wayland_child(&wayland_status) {
        return Some(exit_code_from_linux_display_child_status(wayland_status));
    }

    eprintln!("Galley Pad Wayland startup failed; retrying with X11.");
    match run_linux_display_child("x11") {
        Ok(status) => Some(exit_code_from_linux_display_child_status(status)),
        Err(error) => {
            eprintln!("{error}");
            Some(exit_code_from_linux_display_child_status(wayland_status))
        }
    }
}

#[cfg(target_os = "linux")]
fn run_linux_display_child(gdk_backend: &str) -> Result<LinuxDisplayChildStatus, String> {
    let executable = std::env::current_exe().map_err(|error| {
        format!("Failed to resolve Galley Pad executable for display backend retry: {error}")
    })?;
    let ready_file = linux_display_ready_file(gdk_backend);
    let _ = fs::remove_file(&ready_file);

    let mut child = std::process::Command::new(executable)
        .args(std::env::args_os().skip(1))
        .env("GALLEY_PAD_DISPLAY_CHILD", "1")
        .env("GDK_BACKEND", gdk_backend)
        .env("GALLEY_PAD_DISPLAY_READY_FILE", &ready_file)
        .spawn()
        .map_err(|error| format!("Failed to launch Galley Pad with {gdk_backend}: {error}"))?;

    loop {
        if ready_file.exists() {
            let status = child.wait().map_err(|error| {
                format!("Failed waiting for Galley Pad with {gdk_backend}: {error}")
            })?;
            let _ = fs::remove_file(&ready_file);
            return Ok(LinuxDisplayChildStatus::Started(status));
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed checking Galley Pad with {gdk_backend}: {error}"))?
        {
            let _ = fs::remove_file(&ready_file);
            return Ok(LinuxDisplayChildStatus::ExitedBeforeReady(status));
        }

        thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "linux")]
fn linux_display_ready_file(gdk_backend: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        "galley-pad-display-ready-{}-{gdk_backend}-{unique}",
        std::process::id()
    ))
}

#[cfg(target_os = "linux")]
fn signal_linux_display_ready_once(signaled: &mut bool) {
    if *signaled {
        return;
    }
    *signaled = true;

    if let Some(path) = std::env::var_os("GALLEY_PAD_DISPLAY_READY_FILE") {
        if let Err(error) = fs::write(path, b"ready") {
            eprintln!("Failed to signal Galley Pad display startup readiness: {error}");
        }
    }
}

#[cfg(target_os = "linux")]
fn should_retry_x11_after_wayland_child(status: &LinuxDisplayChildStatus) -> bool {
    matches!(status, LinuxDisplayChildStatus::ExitedBeforeReady(exit_status) if !exit_status.success())
}

#[cfg(target_os = "linux")]
fn exit_code_from_linux_display_child_status(status: LinuxDisplayChildStatus) -> i32 {
    match status {
        LinuxDisplayChildStatus::Started(exit_status)
        | LinuxDisplayChildStatus::ExitedBeforeReady(exit_status) => exit_code(exit_status),
    }
}

#[cfg(target_os = "linux")]
fn exit_code(status: std::process::ExitStatus) -> i32 {
    status.code().unwrap_or(1)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    if let Some(code) = run_with_linux_display_supervisor_if_needed() {
        std::process::exit(code);
    }

    #[cfg(target_os = "linux")]
    configure_linux_display_backend();

    let args = std::env::args_os().collect::<Vec<_>>();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let pending_markdown_file_open =
        PendingMarkdownFileOpen(Mutex::new(markdown_paths_from_os_args(&args, &cwd)));

    let app = tauri::Builder::default()
        .manage(pending_markdown_file_open)
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            for path in markdown_paths_from_args(&args, Path::new(&cwd)) {
                if let Err(error) = emit_or_queue_markdown_file_open(app, path) {
                    eprintln!("{error}");
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .menu(build_native_menu)
        .on_menu_event(|app, event| {
            if let Some(command) = menu_command_payload(event.id().as_ref()) {
                if let Err(error) = emit_app_menu_command(app, command) {
                    eprintln!("{error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            take_pending_markdown_file_opens,
            open_markdown_file_window,
            list_system_fonts,
            read_app_settings,
            write_app_settings,
            read_swap_state,
            write_swap_state,
            clear_swap_state
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while building {}: {error}", app_title()));

    #[cfg(target_os = "linux")]
    let mut linux_display_ready_signaled = false;

    app.run(move |app, event| {
        #[cfg(target_os = "linux")]
        let _ = &app;

        #[cfg(target_os = "linux")]
        if matches!(&event, tauri::RunEvent::Ready) {
            signal_linux_display_ready_once(&mut linux_display_ready_signaled);
        }

        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = event {
            for path in markdown_paths_from_urls(&urls) {
                if let Err(error) = emit_or_queue_markdown_file_open(app, path) {
                    eprintln!("{error}");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::app_title;
    use std::ffi::OsString;
    use std::fs;
    use std::path::Path;
    use tauri::Url;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[test]
    fn markdown_paths_from_os_args_accepts_all_markdown_file_args() {
        let cwd = Path::new("/tmp/project");
        let args = vec![
            OsString::from("galley-pad"),
            OsString::from("--flag"),
            OsString::from("notes.txt"),
            OsString::from("draft.markdown"),
            OsString::from("/tmp/other.md"),
        ];

        assert_eq!(
            super::markdown_paths_from_os_args(&args, cwd),
            vec![
                "/tmp/project/draft.markdown".to_string(),
                "/tmp/other.md".to_string()
            ]
        );
    }

    #[test]
    fn markdown_paths_from_args_accepts_all_markdown_file_args() {
        let cwd = Path::new("/tmp/project");
        let args = vec![
            "gpad".to_string(),
            "--flag".to_string(),
            "one.md".to_string(),
            "notes.txt".to_string(),
            "/tmp/two.markdown".to_string(),
        ];

        assert_eq!(
            super::markdown_paths_from_args(&args, cwd),
            vec![
                "/tmp/project/one.md".to_string(),
                "/tmp/two.markdown".to_string()
            ]
        );
    }

    #[test]
    fn markdown_paths_from_args_normalizes_relative_paths_against_cwd() {
        let args = vec![
            "gpad".to_string(),
            "./notes/../draft.md".to_string(),
            "../outside.markdown".to_string(),
        ];

        assert_eq!(
            super::markdown_paths_from_args(&args, Path::new("/tmp/project/docs")),
            vec![
                "/tmp/project/docs/draft.md".to_string(),
                "/tmp/project/outside.markdown".to_string()
            ]
        );
    }

    #[test]
    fn markdown_paths_from_args_resolves_creation_paths_from_cli_cwd() {
        let cwd = Path::new("/tmp/project/docs");
        let args = vec![
            "gpad".to_string(),
            "new-file.md".to_string(),
            "/tmp/absolute/new-file.markdown".to_string(),
        ];

        assert_eq!(
            super::markdown_paths_from_args(&args, cwd),
            vec![
                "/tmp/project/docs/new-file.md".to_string(),
                "/tmp/absolute/new-file.markdown".to_string()
            ]
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_display_supervisor_retries_x11_only_before_startup_ready() {
        use std::os::unix::process::ExitStatusExt;

        let failed_before_ready = super::LinuxDisplayChildStatus::ExitedBeforeReady(
            std::process::ExitStatus::from_raw(1 << 8),
        );
        let failed_after_ready =
            super::LinuxDisplayChildStatus::Started(std::process::ExitStatus::from_raw(1 << 8));
        let succeeded_before_ready = super::LinuxDisplayChildStatus::ExitedBeforeReady(
            std::process::ExitStatus::from_raw(0),
        );

        assert!(super::should_retry_x11_after_wayland_child(
            &failed_before_ready
        ));
        assert!(!super::should_retry_x11_after_wayland_child(
            &failed_after_ready
        ));
        assert!(!super::should_retry_x11_after_wayland_child(
            &succeeded_before_ready
        ));
    }

    #[test]
    fn normalize_path_clamps_parent_dirs_at_absolute_root() {
        assert_eq!(
            super::normalize_path(Path::new("/../tmp/../draft.md")),
            Path::new("/draft.md")
        );
        assert_eq!(
            super::normalize_path(Path::new("../draft.md")),
            Path::new("../draft.md")
        );
    }

    #[test]
    fn markdown_paths_from_urls_accepts_file_urls_only() {
        let markdown_path = std::env::temp_dir().join("README.MD");
        let text_path = std::env::temp_dir().join("notes.txt");
        let urls = vec![
            Url::parse("https://example.com/readme.md").expect("parse https url"),
            Url::from_file_path(&markdown_path).expect("create markdown file url"),
            Url::from_file_path(text_path).expect("create text file url"),
        ];

        assert_eq!(
            super::markdown_paths_from_urls(&urls),
            vec![markdown_path.to_string_lossy().into_owned()]
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

    #[test]
    fn font_preview_includes_cyrillic_for_cyrillic_locales() {
        assert!(super::localized_font_preview_text(Some("ru-RU")).contains("Аа"));
        assert!(super::localized_font_preview_text(Some("uk_UA")).contains("Съешь"));
        assert!(super::localized_font_preview_text(Some("en-US")).contains("quick brown"));
    }

    #[test]
    fn css_font_family_quote_escapes_font_names() {
        assert_eq!(
            super::quote_css_font_family("A \"Quoted\" Font"),
            "\"A \\\"Quoted\\\" Font\""
        );
    }

    #[test]
    fn write_json_file_replaces_destination_with_complete_json() {
        #[derive(serde::Serialize)]
        struct TestSettings {
            name: String,
        }

        let directory =
            std::env::temp_dir().join(format!("galley-pad-json-test-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("create temp test directory");
        let path = directory.join("settings.json");
        fs::write(&path, "{\"name\":\"old\"}").expect("write existing file");

        super::write_json_file(
            &path,
            &TestSettings {
                name: "new".to_string(),
            },
        )
        .expect("write json atomically");

        assert_eq!(
            fs::read_to_string(&path).expect("read replaced file"),
            "{\n  \"name\": \"new\"\n}"
        );
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn persisted_app_settings_deserializes_without_theme_settings() {
        let settings = serde_json::from_str::<super::RawPersistedAppSettings>(
            r#"{
                "appearanceTheme": "galley-dark",
                "editorFontFamily": "Fira Code",
                "editorFontSize": "large",
                "openMode": "tabs"
            }"#,
        )
        .expect("deserialize old persisted app settings");

        assert!(settings.theme_settings.is_none());
    }

    #[test]
    fn persisted_app_settings_deserializes_null_theme_settings() {
        let settings = serde_json::from_str::<super::RawPersistedAppSettings>(
            r#"{
                "appearanceTheme": "galley-dark",
                "themeSettings": null,
                "editorFontFamily": "Fira Code",
                "editorFontSize": "large",
                "openMode": "tabs"
            }"#,
        )
        .expect("deserialize null theme settings");

        assert!(settings.theme_settings.is_none());
    }

    #[test]
    fn persisted_app_settings_preserves_malformed_theme_settings_value() {
        let settings = serde_json::from_str::<super::RawPersistedAppSettings>(
            r#"{
                "appearanceTheme": "galley-dark",
                "themeSettings": {
                    "mode": "broken",
                    "constantThemeId": 42
                },
                "editorFontFamily": "Fira Code",
                "editorFontSize": "large",
                "openMode": "tabs"
            }"#,
        )
        .expect("deserialize malformed theme settings as raw value");

        assert_eq!(
            settings
                .theme_settings
                .expect("theme settings value")
                .get("constantThemeId"),
            Some(&serde_json::json!(42))
        );
    }

    #[test]
    fn persisted_app_settings_write_rejects_invalid_theme_mode() {
        let result = serde_json::from_str::<super::PersistedAppSettings>(
            r#"{
                "themeSettings": {
                    "mode": "broken",
                    "constantThemeId": "galley-light",
                    "lightThemeId": "solarized-light",
                    "darkThemeId": "tokyo-night"
                },
                "openMode": "tabs"
            }"#,
        );

        assert!(result.is_err());
    }

    #[test]
    fn persisted_app_settings_write_rejects_missing_or_numeric_theme_fields() {
        let missing_field = serde_json::from_str::<super::PersistedAppSettings>(
            r#"{
                "themeSettings": {
                    "mode": "system",
                    "constantThemeId": "galley-light",
                    "darkThemeId": "tokyo-night"
                },
                "openMode": "tabs"
            }"#,
        );
        let numeric_id = serde_json::from_str::<super::PersistedAppSettings>(
            r#"{
                "themeSettings": {
                    "mode": "system",
                    "constantThemeId": 42,
                    "lightThemeId": "solarized-light",
                    "darkThemeId": "tokyo-night"
                },
                "openMode": "tabs"
            }"#,
        );

        assert!(missing_field.is_err());
        assert!(numeric_id.is_err());
    }

    #[test]
    fn persisted_app_settings_write_accepts_valid_theme_settings() {
        let settings = serde_json::from_str::<super::PersistedAppSettings>(
            r#"{
                "appearanceTheme": "galley-dark",
                "themeSettings": {
                    "mode": "system",
                    "constantThemeId": "galley-light",
                    "lightThemeId": "solarized-light",
                    "darkThemeId": "tokyo-night"
                },
                "editorFontFamily": "Fira Code",
                "editorFontSize": "large",
                "openMode": "tabs"
            }"#,
        )
        .expect("deserialize valid write app settings");

        let theme_settings = settings.theme_settings.expect("theme settings");
        assert_eq!(theme_settings.mode, super::ThemeMode::System);
        assert_eq!(theme_settings.dark_theme_id, "tokyo-night");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_wayland_disables_dmabuf_renderer_when_unconfigured() {
        assert!(super::should_disable_dmabuf_renderer(true, false));
        assert!(!super::should_disable_dmabuf_renderer(true, true));
        assert!(!super::should_disable_dmabuf_renderer(false, false));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_mixed_wayland_x11_session_supervises_wayland_first_when_unconfigured() {
        assert!(super::should_supervise_linux_display_backend(
            false, false, true, true
        ));
        assert!(!super::should_supervise_linux_display_backend(
            true, false, true, true
        ));
        assert!(!super::should_supervise_linux_display_backend(
            false, true, true, true
        ));
        assert!(!super::should_supervise_linux_display_backend(
            false, false, true, false
        ));
        assert!(!super::should_supervise_linux_display_backend(
            false, false, false, true
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_wayland_disables_webkit_compositing_mode_when_unconfigured() {
        assert!(super::should_disable_compositing_mode(true, false));
        assert!(!super::should_disable_compositing_mode(true, true));
        assert!(!super::should_disable_compositing_mode(false, false));
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
    fn read_text_file_returns_empty_result_for_missing_file_path() {
        let directory = tempfile::tempdir().expect("create temp dir");
        let path = directory.path().join("new-draft.md");

        let result = super::read_text_file_from_path(path.to_string_lossy().into_owned())
            .expect("read missing text file as new file");

        assert_eq!(result.path, path.to_string_lossy());
        assert_eq!(result.content, "");
        assert_eq!(result.line_ending, super::LineEnding::Lf);
        assert_eq!(result.last_modified_at, None);
        assert!(!path.exists());
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
