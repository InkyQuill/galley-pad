use serde::{de::DeserializeOwned, Deserialize, Serialize};
#[cfg(target_os = "linux")]
use std::io::IsTerminal;
#[cfg(target_os = "linux")]
use std::os::unix::process::CommandExt;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::{OsStr, OsString},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "linux")]
use std::{thread, time::Duration};
#[cfg(desktop)]
use tauri::menu::AboutMetadata;
#[cfg(desktop)]
use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

mod active_file_watch;
mod app_quit;
mod document_assets;
mod document_file;
mod document_ownership;
mod recent_files;
mod window_events;
mod window_recovery;
pub use document_file::{
    read_text_file_from_path, write_text_file_to_path, FileReadResult, FileWriteResult, LineEnding,
    TextEncoding,
};
use document_ownership::{activate_document_owner, DocumentOwners, DocumentOwnershipError};
use window_recovery::{clear_swap_state, read_swap_state, write_swap_state};

const MARKDOWN_FILE_OPENED_EVENT: &str = "markdown-file-opened";
const APP_MENU_COMMAND_EVENT: &str = "app-menu-command";
const MENU_CLOSE_ID: &str = "app-menu-close";
const MENU_NEW_ID: &str = "app-menu-new";
const MENU_OPEN_ID: &str = "app-menu-open";
const MENU_OPEN_RECENT_ID: &str = "app-menu-open-recent";
const MENU_MODE_LIVE_ID: &str = "app-menu-mode-live";
const MENU_MODE_MARKDOWN_ID: &str = "app-menu-mode-markdown";
const MENU_MODE_PREVIEW_ID: &str = "app-menu-mode-preview";
const MENU_FILE_ID: &str = "app-menu-file";
const MENU_SAVE_ID: &str = "app-menu-save";
const MENU_SAVE_AS_ID: &str = "app-menu-save-as";
const MENU_FIND_ID: &str = "app-menu-find";
const MENU_TOGGLE_OUTLINE_ID: &str = "app-menu-toggle-outline";
const MENU_TOGGLE_TOOLBAR_ID: &str = "app-menu-toggle-toolbar";
const MENU_VIEW_ID: &str = "app-menu-view";
const MENU_WORD_WRAP_ID: &str = "app-menu-word-wrap";
const MENU_SETTINGS_ID: &str = "app-menu-settings";
const MENU_QUIT_ID: &str = "app-menu-quit";
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(target_os = "linux")]
const LINUX_CLI_CHILD_ENV: &str = "GALLEY_PAD_CLI_CHILD";
#[cfg(target_os = "linux")]
const LINUX_DISPLAY_CHILD_ENV: &str = "GALLEY_PAD_DISPLAY_CHILD";
static MARKDOWN_WINDOW_INDEX: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, PartialEq, Eq)]
struct MenuItemSpec {
    id: &'static str,
    label: &'static str,
    accelerator: &'static str,
}

#[derive(Debug, PartialEq, Eq)]
struct CheckMenuItemSpec {
    id: &'static str,
    label: &'static str,
    accelerator: &'static str,
    checked: bool,
}

fn find_menu_item_spec() -> MenuItemSpec {
    MenuItemSpec {
        id: MENU_FIND_ID,
        label: "Find...",
        accelerator: "CmdOrCtrl+F",
    }
}

fn word_wrap_menu_item_spec() -> CheckMenuItemSpec {
    CheckMenuItemSpec {
        id: MENU_WORD_WRAP_ID,
        label: "Word Wrap",
        accelerator: "Alt+Z",
        checked: true,
    }
}

fn app_title() -> &'static str {
    "Galley Pad"
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
    pub word_wrap: Option<serde_json::Value>,
    pub editor_line_width: Option<u16>,
    pub spellcheck: Option<bool>,
    pub allow_remote_images: Option<bool>,
    pub check_for_updates: Option<bool>,
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
    pub word_wrap: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub editor_line_width: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spellcheck: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_remote_images: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_for_updates: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileOpen {
    path: String,
    allow_missing: bool,
}

#[derive(Default)]
struct MarkdownOpenQueue {
    pending: Vec<MarkdownFileOpen>,
    ready_windows: HashSet<String>,
}

impl MarkdownOpenQueue {
    fn register(&mut self, label: &str, primary_exists: bool) -> Vec<MarkdownFileOpen> {
        self.ready_windows.insert(label.to_owned());
        if label != MAIN_WINDOW_LABEL && primary_exists {
            return Vec::new();
        }
        std::mem::take(&mut self.pending)
    }
}

struct PendingMarkdownFileOpen(Mutex<MarkdownOpenQueue>);

#[tauri::command]
fn take_pending_markdown_file_opens(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PendingMarkdownFileOpen>,
) -> Vec<MarkdownFileOpen> {
    let Ok(mut queue) = state.0.lock() else {
        return Vec::new();
    };
    queue.register(
        window.label(),
        window
            .app_handle()
            .get_webview_window(MAIN_WINDOW_LABEL)
            .is_some(),
    )
}

#[tauri::command]
async fn list_system_fonts() -> Result<SystemFontCatalog, String> {
    tauri::async_runtime::spawn_blocking(list_system_fonts_catalog)
        .await
        .map_err(|error| error.to_string())
}

#[derive(Default)]
struct SettingsWriteLock(Mutex<()>);

fn read_json_or_quarantine<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read '{}': {error}", path.display())),
    };
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(Some(value)),
        Err(error) => {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default();
            let backup = path.with_extension(format!("json.corrupt-{timestamp}"));
            fs::rename(path, &backup).map_err(|move_error| {
                format!(
                    "Failed to move corrupt '{}' aside ({error}): {move_error}",
                    path.display()
                )
            })?;
            eprintln!(
                "Moved corrupt configuration to '{}': {error}",
                backup.display()
            );
            Ok(None)
        }
    }
}

#[tauri::command]
fn read_app_settings(
    app: AppHandle,
    lock: tauri::State<'_, SettingsWriteLock>,
) -> Result<Option<RawPersistedAppSettings>, String> {
    let _guard = lock.0.lock().map_err(|_| "App settings are unavailable")?;
    read_json_or_quarantine(&app_config_file(&app, "settings.json")?)
}

fn merge_app_settings(
    path: &Path,
    settings: PersistedAppSettings,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    use serde_json::{Map, Value};

    let mut stored: Map<String, Value> = read_json_or_quarantine(path)?.unwrap_or_default();
    let Value::Object(mut patch) =
        serde_json::to_value(settings).map_err(|error| error.to_string())?
    else {
        return Err("Invalid app settings patch".into());
    };
    patch.retain(|_, value| !value.is_null());
    stored.extend(patch.clone());
    write_json_file(path, &stored)?;
    Ok(patch)
}

#[tauri::command]
fn write_app_settings(
    app: AppHandle,
    lock: tauri::State<'_, SettingsWriteLock>,
    settings: PersistedAppSettings,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "App settings are unavailable")?;
    let patch = merge_app_settings(&app_config_file(&app, "settings.json")?, settings)?;
    app.emit("app-settings-updated", patch)
        .map_err(|error| error.to_string())
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
    if !is_markdown_path(path) {
        return None;
    }
    utf8_document_path(absolute_path_from_arg(path, cwd))
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
        .filter_map(utf8_document_path)
        .collect()
}

fn utf8_document_path(path: PathBuf) -> Option<String> {
    match path.into_os_string().into_string() {
        Ok(path) => Some(path),
        Err(path) => {
            eprintln!("Cannot open a document whose path is not UTF-8: {path:?}");
            None
        }
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            ["md", "markdown", "txt"]
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
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

fn cascade_position(label: &str, origin: (f64, f64), bounds: (f64, f64)) -> Option<(f64, f64)> {
    let index: u64 = label.strip_prefix("markdown-file-")?.parse().ok()?;
    let offset = ((index.saturating_sub(1) % 8) + 1) as f64 * 24.0;
    Some((
        (origin.0 + offset).min(bounds.0),
        (origin.1 + offset).min(bounds.1),
    ))
}

#[cfg(desktop)]
fn build_editor_window(app: &AppHandle, label: &str, url: String) -> tauri::Result<()> {
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(app_title())
        .inner_size(980.0, 720.0)
        .min_inner_size(640.0, 420.0)
        .resizable(true);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let origin = (f64::from(position.x) / scale, f64::from(position.y) / scale);
        let bounds = (
            origin.0 + (f64::from(size.width) / scale - 980.0).max(0.0),
            origin.1 + (f64::from(size.height) / scale - 720.0).max(0.0),
        );
        if let Some((x, y)) = cascade_position(label, origin, bounds) {
            builder = builder.position(x, y);
        }
    }
    builder.build()?;
    Ok(())
}

#[cfg(desktop)]
fn next_document_window_label(app: &AppHandle) -> Result<String, String> {
    loop {
        let candidate =
            markdown_window_label(MARKDOWN_WINDOW_INDEX.fetch_add(1, Ordering::Relaxed));
        if app.get_webview_window(&candidate).is_none()
            && !window_recovery::swap_path(app, &candidate)?.exists()
        {
            return Ok(candidate);
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
fn open_draft_window(app: AppHandle) -> Result<String, String> {
    if app_quit::in_progress(&app) {
        return Err("Wait for the quit confirmation before opening a new window".into());
    }
    let label = next_document_window_label(&app)?;
    build_editor_window(&app, &label, "index.html".to_string())
        .map_err(|error| format!("Failed to open a draft window: {error}"))?;
    Ok(label)
}

#[cfg(desktop)]
#[tauri::command]
fn open_markdown_file_window(
    app: AppHandle,
    owners: tauri::State<'_, DocumentOwners>,
    path: String,
    allow_missing: Option<bool>,
    fragment: Option<String>,
) -> Result<String, String> {
    if app_quit::in_progress(&app) {
        return Err("Wait for the quit confirmation before opening a new window".into());
    }
    let label = next_document_window_label(&app)?;
    let canonical = match owners.claim(&label, None, Path::new(&path)) {
        Ok(path) => path,
        Err(DocumentOwnershipError::AlreadyOpen { owner, .. }) => {
            activate_document_owner(&app, &owner, fragment.as_deref());
            return Ok(owner.window_label);
        }
        Err(error) => return Err(error.to_string()),
    };
    let allow_missing = allow_missing.unwrap_or(false);
    let result = (|| {
        if !allow_missing && !canonical.exists() {
            return Err(format!(
                "The file no longer exists: {}",
                canonical.display()
            ));
        }
        let canonical = canonical
            .to_str()
            .ok_or("Document path is not valid Unicode")?;
        let mut url = markdown_window_url(canonical);
        if let Some(fragment) = fragment {
            url.push_str("&fragment=");
            url.push_str(&percent_encode_query_value(&fragment));
        }
        if allow_missing {
            url.push_str("&allowMissing=1");
        }
        build_editor_window(&app, &label, url)
            .map_err(|error| format!("Failed to open '{path}' in a new window: {error}"))
    })();
    if result.is_err() {
        let _ = owners.release(&label, None);
    }
    result.map(|()| label)
}

fn menu_command_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        MENU_NEW_ID => Some("new"),
        MENU_CLOSE_ID => Some("close"),
        MENU_OPEN_ID => Some("open"),
        MENU_OPEN_RECENT_ID => Some("open-recent"),
        MENU_MODE_LIVE_ID => Some("mode-live"),
        MENU_MODE_MARKDOWN_ID => Some("mode-markdown"),
        MENU_MODE_PREVIEW_ID => Some("mode-preview"),
        MENU_SAVE_ID => Some("save"),
        MENU_SAVE_AS_ID => Some("save-as"),
        MENU_FIND_ID => Some("find"),
        MENU_TOGGLE_TOOLBAR_ID => Some("toggle-toolbar"),
        MENU_TOGGLE_OUTLINE_ID => Some("toggle-outline"),
        MENU_WORD_WRAP_ID => Some("toggle-word-wrap"),
        MENU_SETTINGS_ID => Some("settings"),
        _ => None,
    }
}

fn emit_or_queue_markdown_file_open<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: MarkdownFileOpen,
) -> Result<(), String> {
    let state = app.state::<PendingMarkdownFileOpen>();
    let windows = app.webview_windows();
    let mut queue = state
        .0
        .lock()
        .map_err(|_| "Pending Markdown file state is unavailable")?;
    queue.pending.push(request);
    let target = match windows.get(MAIN_WINDOW_LABEL) {
        Some(main) => queue
            .ready_windows
            .contains(MAIN_WINDOW_LABEL)
            .then_some(main),
        None => windows
            .values()
            .find(|window| queue.ready_windows.contains(window.label())),
    };
    drop(queue);
    if let Some(window) = target {
        window_events::emit_editor_event(window, MARKDOWN_FILE_OPENED_EVENT, ())
            .map_err(|error| format!("Failed to signal pending Markdown file open: {error}"))?;
    }
    Ok(())
}

#[derive(Default)]
struct MenuCommandQueue {
    ready_windows: HashSet<String>,
    pending: HashMap<String, Vec<&'static str>>,
}

#[derive(Default)]
struct PendingMenuCommands(Mutex<MenuCommandQueue>);

#[tauri::command]
fn take_pending_menu_commands(
    window: tauri::WebviewWindow,
    commands: tauri::State<'_, PendingMenuCommands>,
) -> Result<Vec<&'static str>, String> {
    let mut queue = commands
        .0
        .lock()
        .map_err(|_| "Menu command queue is unavailable")?;
    queue.ready_windows.insert(window.label().to_owned());
    Ok(queue.pending.remove(window.label()).unwrap_or_default())
}

fn emit_app_menu_command(app: &AppHandle, command: &'static str) -> Result<(), String> {
    let windows = app.webview_windows();
    let target = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| windows.get(MAIN_WINDOW_LABEL))
        .or_else(|| windows.values().next());
    let commands = app.state::<PendingMenuCommands>();

    if let Some(target) = target {
        let mut queue = commands
            .0
            .lock()
            .map_err(|_| "Menu command queue is unavailable")?;
        queue
            .pending
            .entry(target.label().to_owned())
            .or_default()
            .push(command);
        let ready = queue.ready_windows.contains(target.label());
        drop(queue);
        if ready {
            window_events::emit_editor_event(target, APP_MENU_COMMAND_EVENT, ())
                .map_err(|error| format!("Failed to signal menu command: {error}"))?;
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    if matches!(command, "new" | "open" | "open-recent" | "settings") {
        // Opening a fresh window already fulfills New; the other commands need
        // delivery after the newly created webview installs its listener.
        if command != "new" {
            commands
                .0
                .lock()
                .map_err(|_| "Menu command queue is unavailable")?
                .pending
                .entry(MAIN_WINDOW_LABEL.to_owned())
                .or_default()
                .push(command);
        }
        return build_editor_window(app, MAIN_WINDOW_LABEL, "index.html".into())
            .map_err(|error| format!("Failed to open a window for {command}: {error}"));
    }
    Err("No window is available to receive the menu command".into())
}

#[tauri::command]
fn set_word_wrap_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
    set_word_wrap_menu_checked_for_app(&app, checked)
}

pub fn set_word_wrap_menu_checked_for_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    checked: bool,
) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "Application menu is unavailable".to_string())?;
    let view_menu = menu
        .get(MENU_VIEW_ID)
        .ok_or_else(|| "View menu is unavailable".to_string())?;
    let view_menu = match view_menu {
        MenuItemKind::Submenu(menu) => menu,
        _ => return Err("View menu has an unexpected type".to_string()),
    };
    let item = view_menu
        .get(MENU_WORD_WRAP_ID)
        .ok_or_else(|| "Word Wrap menu item is unavailable".to_string())?;

    match item {
        MenuItemKind::Check(item) => item
            .set_checked(checked)
            .map_err(|error| format!("Failed to update Word Wrap menu item: {error}")),
        _ => Err("Word Wrap menu item has an unexpected type".to_string()),
    }
}

#[tauri::command]
fn set_file_menu_busy(window: tauri::WebviewWindow, busy: bool) -> Result<(), String> {
    if !window.is_focused().unwrap_or(false) {
        return Ok(());
    }
    let app = window.app_handle();
    let Some(MenuItemKind::Submenu(file)) = app.menu().and_then(|menu| menu.get(MENU_FILE_ID))
    else {
        return Ok(());
    };
    for id in [
        MENU_NEW_ID,
        MENU_OPEN_ID,
        MENU_OPEN_RECENT_ID,
        MENU_SAVE_ID,
        MENU_SAVE_AS_ID,
    ] {
        if let Some(MenuItemKind::MenuItem(item)) = file.get(id) {
            item.set_enabled(!busy).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
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
                    &MenuItem::with_id(
                        app,
                        MENU_QUIT_ID,
                        format!("Quit {}", app_title()),
                        true,
                        Some("CmdOrCtrl+Q"),
                    )?,
                ],
            )?,
            &Submenu::with_id_and_items(
                app,
                MENU_FILE_ID,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, MENU_NEW_ID, "New", true, Some("CmdOrCtrl+N"))?,
                    &MenuItem::with_id(app, MENU_OPEN_ID, "Open...", true, Some("CmdOrCtrl+O"))?,
                    &MenuItem::with_id(
                        app,
                        MENU_OPEN_RECENT_ID,
                        "Open Recent...",
                        true,
                        None::<&str>,
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, MENU_SAVE_ID, "Save", true, Some("CmdOrCtrl+S"))?,
                    &MenuItem::with_id(
                        app,
                        MENU_SAVE_AS_ID,
                        "Save As...",
                        true,
                        Some("CmdOrCtrl+Shift+S"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, MENU_CLOSE_ID, "Close", true, Some("CmdOrCtrl+W"))?,
                    #[cfg(not(target_os = "macos"))]
                    &MenuItem::with_id(app, MENU_QUIT_ID, "Quit", true, Some("CmdOrCtrl+Q"))?,
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
                    &PredefinedMenuItem::separator(app)?,
                    &{
                        let spec = find_menu_item_spec();
                        MenuItem::with_id(app, spec.id, spec.label, true, Some(spec.accelerator))?
                    },
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_id_and_items(
                app,
                MENU_VIEW_ID,
                "View",
                true,
                &[
                    &MenuItem::with_id(
                        app,
                        MENU_TOGGLE_TOOLBAR_ID,
                        "Toggle Editor Toolbar",
                        true,
                        Some("CmdOrCtrl+Shift+L"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        MENU_TOGGLE_OUTLINE_ID,
                        "Table of Contents",
                        true,
                        Some("CmdOrCtrl+Shift+O"),
                    )?,
                    &Submenu::with_items(
                        app,
                        "Editor Mode",
                        true,
                        &[
                            &MenuItem::with_id(app, MENU_MODE_LIVE_ID, "Live", true, None::<&str>)?,
                            &MenuItem::with_id(
                                app,
                                MENU_MODE_MARKDOWN_ID,
                                "Markdown",
                                true,
                                None::<&str>,
                            )?,
                            &MenuItem::with_id(
                                app,
                                MENU_MODE_PREVIEW_ID,
                                "Preview",
                                true,
                                None::<&str>,
                            )?,
                        ],
                    )?,
                    &{
                        let spec = word_wrap_menu_item_spec();
                        CheckMenuItem::with_id(
                            app,
                            spec.id,
                            spec.label,
                            true,
                            spec.checked,
                            Some(spec.accelerator),
                        )?
                    },
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
            #[cfg(not(target_os = "macos"))]
            &Submenu::with_items(
                app,
                "Help",
                true,
                &[&PredefinedMenuItem::about(app, None, Some(about_metadata))?],
            )?,
        ],
    )
}

#[cfg(target_os = "linux")]
fn should_disable_dmabuf_renderer(dmabuf_renderer_configured: bool) -> bool {
    !dmabuf_renderer_configured
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
/// Configure WebKit defaults before GTK starts. Call only during single-threaded startup.
pub fn configure_linux_display_backend() {
    let effective_wayland_backend = std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("GDK_BACKEND").is_none_or(|backend| backend != "x11");

    // Desktop launchers may pass GDK_BACKEND=x11 even in a Wayland session.
    // WebKit uses DMA-BUF there too; GBM allocation failure leaves a blank window.
    if should_disable_dmabuf_renderer(std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some())
    {
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
    TimedOut,
}

#[cfg(target_os = "linux")]
fn run_with_linux_display_supervisor_if_needed() -> Option<i32> {
    if !should_supervise_linux_display_backend(
        std::env::var_os(LINUX_DISPLAY_CHILD_ENV).is_some(),
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
        .env(LINUX_DISPLAY_CHILD_ENV, "1")
        .env("GDK_BACKEND", gdk_backend)
        .env("GALLEY_PAD_DISPLAY_READY_FILE", &ready_file)
        .spawn()
        .map_err(|error| format!("Failed to launch Galley Pad with {gdk_backend}: {error}"))?;

    wait_for_linux_display_child(
        &mut child,
        &ready_file,
        gdk_backend,
        Duration::from_secs(20),
    )
}

#[cfg(target_os = "linux")]
fn wait_for_linux_display_child(
    child: &mut std::process::Child,
    ready_file: &Path,
    gdk_backend: &str,
    timeout: Duration,
) -> Result<LinuxDisplayChildStatus, String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if ready_file.exists() {
            let status = child.wait().map_err(|error| {
                format!("Failed waiting for Galley Pad with {gdk_backend}: {error}")
            })?;
            let _ = fs::remove_file(ready_file);
            return Ok(LinuxDisplayChildStatus::Started(status));
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed checking Galley Pad with {gdk_backend}: {error}"))?
        {
            let _ = fs::remove_file(ready_file);
            return Ok(LinuxDisplayChildStatus::ExitedBeforeReady(status));
        }

        if std::time::Instant::now() >= deadline {
            if let Err(error) = child.kill() {
                if !matches!(child.try_wait(), Ok(Some(_))) {
                    return Err(format!(
                        "Failed stopping stalled Galley Pad with {gdk_backend}: {error}"
                    ));
                }
            }
            child
                .wait()
                .map_err(|error| format!("Failed reaping stalled Galley Pad: {error}"))?;
            let _ = fs::remove_file(ready_file);
            return Ok(LinuxDisplayChildStatus::TimedOut);
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
fn signal_linux_display_ready_once() {
    static SIGNALED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if SIGNALED.swap(true, Ordering::Relaxed) {
        return;
    }

    if let Some(path) = std::env::var_os("GALLEY_PAD_DISPLAY_READY_FILE") {
        if let Err(error) = fs::write(path, b"ready") {
            eprintln!("Failed to signal Galley Pad display startup readiness: {error}");
        }
    }
}

#[cfg(target_os = "linux")]
fn should_retry_x11_after_wayland_child(status: &LinuxDisplayChildStatus) -> bool {
    matches!(status, LinuxDisplayChildStatus::TimedOut)
        || matches!(status, LinuxDisplayChildStatus::ExitedBeforeReady(exit_status) if !exit_status.success())
}

#[cfg(target_os = "linux")]
fn exit_code_from_linux_display_child_status(status: LinuxDisplayChildStatus) -> i32 {
    match status {
        LinuxDisplayChildStatus::Started(exit_status)
        | LinuxDisplayChildStatus::ExitedBeforeReady(exit_status) => exit_code(exit_status),
        LinuxDisplayChildStatus::TimedOut => 1,
    }
}

#[cfg(target_os = "linux")]
fn exit_code(status: std::process::ExitStatus) -> i32 {
    status.code().unwrap_or(1)
}

#[cfg(target_os = "linux")]
fn should_spawn_linux_cli_child(
    cli_child: bool,
    display_child: bool,
    stdin_terminal: bool,
    stdout_terminal: bool,
    stderr_terminal: bool,
) -> bool {
    !cli_child && !display_child && (stdin_terminal || stdout_terminal || stderr_terminal)
}

#[cfg(target_os = "linux")]
fn run_with_linux_cli_launcher_if_needed() -> Result<bool, String> {
    if !should_spawn_linux_cli_child(
        std::env::var_os(LINUX_CLI_CHILD_ENV).is_some(),
        std::env::var_os(LINUX_DISPLAY_CHILD_ENV).is_some(),
        std::io::stdin().is_terminal(),
        std::io::stdout().is_terminal(),
        std::io::stderr().is_terminal(),
    ) {
        return Ok(false);
    }

    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve Galley Pad executable: {error}"))?;
    let mut command = std::process::Command::new(executable);
    command
        .args(std::env::args_os().skip(1))
        .env(LINUX_CLI_CHILD_ENV, "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0);
    command
        .spawn()
        .map_err(|error| format!("Failed to launch Galley Pad in the background: {error}"))?;

    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    match run_with_linux_cli_launcher_if_needed() {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => eprintln!("{error}"),
    }

    #[cfg(target_os = "linux")]
    if let Some(code) = run_with_linux_display_supervisor_if_needed() {
        std::process::exit(code);
    }

    #[cfg(target_os = "linux")]
    configure_linux_display_backend();

    let args = std::env::args_os().collect::<Vec<_>>();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let allow_missing = !args.iter().any(|arg| arg == "--open-existing");
    let pending_markdown_file_open = PendingMarkdownFileOpen(Mutex::new(MarkdownOpenQueue {
        pending: markdown_paths_from_os_args(&args, &cwd)
            .into_iter()
            .map(|path| MarkdownFileOpen {
                path,
                allow_missing,
            })
            .collect(),
        ..Default::default()
    }));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pending_markdown_file_open)
        .manage(DocumentOwners::default())
        .manage(SettingsWriteLock::default())
        .manage(PendingMenuCommands::default())
        .manage(app_quit::AppQuit::default())
        .manage(active_file_watch::ActiveFileWatches::default())
        .manage(document_assets::ImageWatches::default())
        .manage(recent_files::RecentFiles::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                app_quit::handle_window_destroyed(window.app_handle(), window.label());
                window
                    .state::<document_assets::ImageWatches>()
                    .remove_window(window.label());
                window
                    .state::<active_file_watch::ActiveFileWatches>()
                    .remove(window.label());
                let _ = window
                    .state::<DocumentOwners>()
                    .release(window.label(), None);
                let commands = window.state::<PendingMenuCommands>();
                if let Ok(mut queue) = commands.0.lock() {
                    queue.ready_windows.remove(window.label());
                    queue.pending.remove(window.label());
                };
                let state = window.state::<PendingMarkdownFileOpen>();
                if let Ok(mut queue) = state.0.lock() {
                    queue.ready_windows.remove(window.label());
                };
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let allow_missing = !args.iter().any(|arg| arg == "--open-existing");
            for path in markdown_paths_from_args(&args, Path::new(&cwd)) {
                if let Err(error) = emit_or_queue_markdown_file_open(
                    app,
                    MarkdownFileOpen {
                        path,
                        allow_missing,
                    },
                ) {
                    eprintln!("{error}");
                }
            }
            #[cfg(target_os = "macos")]
            if app.webview_windows().is_empty() {
                if let Err(error) = build_editor_window(app, MAIN_WINDOW_LABEL, "index.html".into())
                {
                    eprintln!("Failed to reopen Galley Pad: {error}");
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .menu(build_native_menu)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == MENU_QUIT_ID {
                app.exit(0);
                return;
            }
            if let Some(command) = menu_command_payload(event.id().as_ref()) {
                if let Err(error) = emit_app_menu_command(app, command) {
                    eprintln!("{error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            document_file::read_text_file,
            document_file::write_text_file,
            take_pending_markdown_file_opens,
            take_pending_menu_commands,
            open_markdown_file_window,
            open_draft_window,
            document_ownership::claim_document_path,
            document_ownership::release_document_tab,
            app_quit::register_app_quit_window,
            app_quit::answer_app_quit_check,
            app_quit::finish_app_quit_clear,
            active_file_watch::watch_active_document,
            recent_files::read_recent_files,
            recent_files::update_recent_file,
            list_system_fonts,
            document_assets::resolve_document_reference,
            document_assets::watch_document_images,
            read_app_settings,
            write_app_settings,
            read_swap_state,
            write_swap_state,
            clear_swap_state,
            set_file_menu_busy,
            set_word_wrap_menu_checked
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while building {}: {error}", app_title()));

    app.run(move |app, event| {
        if let tauri::RunEvent::ExitRequested { code, api, .. } = &event {
            app_quit::guard_exit(app, *code, api);
        }

        #[cfg(target_os = "macos")]
        if matches!(
            &event,
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            }
        ) {
            if let Some(window) = app.webview_windows().into_values().next() {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else if let Err(error) =
                build_editor_window(app, MAIN_WINDOW_LABEL, "index.html".into())
            {
                eprintln!("Failed to reopen Galley Pad: {error}");
            }
        }

        #[cfg(desktop)]
        if matches!(&event, tauri::RunEvent::Ready) {
            match window_recovery::recovery_window_labels(app) {
                Ok(labels) => {
                    for label in labels {
                        if let Err(error) = build_editor_window(app, &label, "index.html".into()) {
                            eprintln!("Failed to restore window {label}: {error}");
                        }
                    }
                }
                Err(error) => eprintln!("{error}"),
            }
        }
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = event {
            #[cfg(target_os = "macos")]
            if app.webview_windows().is_empty() {
                if let Err(error) = build_editor_window(app, MAIN_WINDOW_LABEL, "index.html".into())
                {
                    eprintln!("Failed to reopen Galley Pad: {error}");
                }
            }
            for path in markdown_paths_from_urls(&urls) {
                if let Err(error) = emit_or_queue_markdown_file_open(
                    app,
                    MarkdownFileOpen {
                        path,
                        allow_missing: false,
                    },
                ) {
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
    #[cfg(unix)]
    use std::path::Path;
    use std::path::PathBuf;
    use tauri::Url;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[test]
    fn accepts_text_paths_at_desktop_entry_points() {
        let directory = tempfile::tempdir().unwrap();
        assert_eq!(
            super::markdown_paths_from_args(&["gpad".into(), "draft.TXT".into()], directory.path()),
            vec![directory
                .path()
                .join("draft.TXT")
                .into_os_string()
                .into_string()
                .unwrap()],
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_non_unicode_paths_without_substituting_another_filename() {
        use std::os::unix::ffi::OsStringExt;
        let argument = OsString::from_vec(b"draft-\xff.md".to_vec());
        assert!(
            super::markdown_paths_from_os_args(&["gpad".into(), argument], Path::new("/docs"))
                .is_empty()
        );
    }

    #[test]
    fn settings_updates_preserve_corrupt_data_and_resume_from_defaults() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::write(&path, "{broken").unwrap();
        let patch = serde_json::from_str(r#"{"wordWrap":false}"#).unwrap();
        super::merge_app_settings(&path, patch).unwrap();
        let stored: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(stored["wordWrap"], false);
        assert!(fs::read_dir(directory.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.path() != path
                && fs::read_to_string(entry.path()).unwrap() == "{broken"));
    }

    #[test]
    fn startup_requests_wait_for_primary_and_are_drained_once() {
        let mut queue = super::MarkdownOpenQueue::default();
        queue.pending.push(super::MarkdownFileOpen {
            path: "/first.md".into(),
            allow_missing: false,
        });
        queue.pending.push(super::MarkdownFileOpen {
            path: "/second.md".into(),
            allow_missing: true,
        });

        assert!(queue.register("markdown-file-1", true).is_empty());
        let routing = queue.register(super::MAIN_WINDOW_LABEL, true);
        assert_eq!(
            routing
                .iter()
                .map(|entry| entry.path.as_str())
                .collect::<Vec<_>>(),
            ["/first.md", "/second.md"]
        );
        assert!(routing[1].allow_missing);
        assert!(queue.register(super::MAIN_WINDOW_LABEL, true).is_empty());
    }

    #[test]
    fn markdown_paths_from_os_args_accepts_all_markdown_file_args() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("project");
        let absolute = directory.path().join("other.md");
        let args = vec![
            OsString::from("galley-pad"),
            OsString::from("--flag"),
            OsString::from("notes.pdf"),
            OsString::from("draft.markdown"),
            absolute.clone().into_os_string(),
        ];
        assert_eq!(
            super::markdown_paths_from_os_args(&args, &cwd)
                .into_iter()
                .map(PathBuf::from)
                .collect::<Vec<_>>(),
            vec![cwd.join("draft.markdown"), absolute]
        );
    }

    #[test]
    fn markdown_paths_from_args_accepts_all_markdown_file_args() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("project");
        let absolute = directory.path().join("two.markdown");
        let args = vec![
            "gpad".to_string(),
            "--flag".to_string(),
            "one.md".to_string(),
            "notes.pdf".to_string(),
            absolute.to_str().unwrap().to_owned(),
        ];
        assert_eq!(
            super::markdown_paths_from_args(&args, &cwd)
                .into_iter()
                .map(PathBuf::from)
                .collect::<Vec<_>>(),
            vec![cwd.join("one.md"), absolute]
        );
    }

    #[test]
    fn markdown_paths_from_args_normalizes_relative_paths_against_cwd() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("docs");
        let args = vec![
            "gpad".to_string(),
            "./notes/../draft.md".to_string(),
            "../outside.markdown".to_string(),
        ];
        assert_eq!(
            super::markdown_paths_from_args(&args, &cwd)
                .into_iter()
                .map(PathBuf::from)
                .collect::<Vec<_>>(),
            vec![
                cwd.join("draft.md"),
                directory.path().join("outside.markdown")
            ]
        );
    }

    #[test]
    fn markdown_paths_from_args_resolves_creation_paths_from_cli_cwd() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().join("docs");
        let absolute = directory.path().join("new-file.markdown");
        let args = vec![
            "gpad".to_string(),
            "new-file.md".to_string(),
            absolute.to_str().unwrap().to_owned(),
        ];
        assert_eq!(
            super::markdown_paths_from_args(&args, &cwd)
                .into_iter()
                .map(PathBuf::from)
                .collect::<Vec<_>>(),
            vec![cwd.join("new-file.md"), absolute]
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

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_cli_launcher_spawns_only_for_interactive_parent() {
        assert!(super::should_spawn_linux_cli_child(
            false, false, true, false, false
        ));
        assert!(super::should_spawn_linux_cli_child(
            false, false, false, true, false
        ));
        assert!(super::should_spawn_linux_cli_child(
            false, false, false, false, true
        ));
        assert!(!super::should_spawn_linux_cli_child(
            true, false, true, true, true
        ));
        assert!(!super::should_spawn_linux_cli_child(
            false, true, true, true, true
        ));
        assert!(!super::should_spawn_linux_cli_child(
            false, false, false, false, false
        ));
    }

    #[cfg(unix)]
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
        let text_path = std::env::temp_dir().join("notes.pdf");
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
        assert_eq!(
            super::menu_command_payload(super::MENU_FIND_ID),
            Some("find")
        );
        assert_eq!(
            super::menu_command_payload(super::MENU_WORD_WRAP_ID),
            Some("toggle-word-wrap")
        );
        assert_eq!(super::menu_command_payload("unknown"), None);
    }

    #[test]
    fn find_menu_item_has_expected_label_and_accelerator() {
        let item = super::find_menu_item_spec();
        assert_eq!(item.id, super::MENU_FIND_ID);
        assert_eq!(item.label, "Find...");
        assert_eq!(item.accelerator, "CmdOrCtrl+F");
    }

    #[test]
    fn word_wrap_menu_item_is_checked_and_uses_alt_z() {
        let item = super::word_wrap_menu_item_spec();
        assert_eq!(item.id, super::MENU_WORD_WRAP_ID);
        assert_eq!(item.label, "Word Wrap");
        assert_eq!(item.accelerator, "Alt+Z");
        assert!(item.checked);
    }

    #[test]
    fn secondary_window_positions_cascade_with_bounded_offsets() {
        assert_eq!(
            super::cascade_position("main", (100.0, 200.0), (300.0, 400.0)),
            None
        );
        assert_eq!(
            super::cascade_position("markdown-file-1", (100.0, 200.0), (300.0, 400.0)),
            Some((124.0, 224.0))
        );
        assert_eq!(
            super::cascade_position("markdown-file-8", (100.0, 200.0), (130.0, 200.0)),
            Some((130.0, 200.0))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_display_startup_timeout_reaps_the_child_and_permits_fallback() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let temp = tempfile::tempdir().unwrap();
        let result = super::wait_for_linux_display_child(
            &mut child,
            &temp.path().join("ready"),
            "wayland",
            std::time::Duration::from_millis(25),
        )
        .unwrap();
        assert!(super::should_retry_x11_after_wayland_child(&result));
        assert!(child.try_wait().unwrap().is_some());
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
        assert!(settings.word_wrap.is_none());
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
    fn raw_persisted_app_settings_preserves_malformed_word_wrap() {
        let settings =
            serde_json::from_str::<super::RawPersistedAppSettings>(r#"{ "wordWrap": "broken" }"#)
                .expect("deserialize malformed word wrap as raw value");

        assert_eq!(settings.word_wrap, Some(serde_json::json!("broken")));
    }

    #[test]
    fn settings_patches_from_different_windows_keep_unrelated_fields() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::write(&path, r#"{"openMode":"tabs","otherField":"preserved"}"#).unwrap();
        let wrap = serde_json::from_str(r#"{"wordWrap":false}"#).unwrap();
        let image = serde_json::from_str(r#"{"allowRemoteImages":true}"#).unwrap();
        assert_eq!(
            super::merge_app_settings(&path, wrap).unwrap()["wordWrap"],
            false
        );
        super::merge_app_settings(&path, image).unwrap();
        let settings: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(settings["wordWrap"], false);
        assert_eq!(settings["allowRemoteImages"], true);
        assert_eq!(settings["openMode"], "tabs");
        assert_eq!(settings["otherField"], "preserved");
    }

    #[test]
    fn persisted_app_settings_write_accepts_boolean_word_wrap() {
        let settings =
            serde_json::from_str::<super::PersistedAppSettings>(r#"{ "wordWrap": false }"#)
                .expect("deserialize valid word wrap write");

        assert_eq!(settings.word_wrap, Some(false));
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
    fn linux_disables_dmabuf_renderer_on_all_backends_unless_configured() {
        assert!(super::should_disable_dmabuf_renderer(false));
        assert!(!super::should_disable_dmabuf_renderer(true));
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
