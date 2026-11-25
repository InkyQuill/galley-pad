use crate::document_ownership::{
    activate_document_owner, canonical_document_path, DocumentOwners, DocumentOwnershipError,
};
use encoding_rs::WINDOWS_1251;
use serde::{Deserialize, Serialize, Serializer};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
    time::UNIX_EPOCH,
};
use tauri::{Manager, Runtime, WebviewWindow};
use tempfile::NamedTempFile;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextEncoding {
    #[default]
    Utf8,
    Utf8Bom,
    Utf16Le,
    Utf16Be,
    Windows1251,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub content: String,
    pub exists: bool,
    pub encoding: TextEncoding,
    pub line_ending: LineEnding,
    pub last_modified_at: Option<u64>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    pub path: String,
    pub encoding: TextEncoding,
    pub line_ending: LineEnding,
    pub last_modified_at: Option<u64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileWriteOptions {
    encoding: TextEncoding,
    expected: Option<FileWriteExpectation>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum FileWriteExpectation {
    Missing,
    Present {
        content: String,
        encoding: TextEncoding,
    },
}

#[derive(Debug)]
pub(crate) enum FileWriteError {
    Conflict(String),
    Io(String),
    Ownership(DocumentOwnershipError),
}

impl std::fmt::Display for FileWriteError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(message) | Self::Io(message) => formatter.write_str(message),
            Self::Ownership(error) => error.fmt(formatter),
        }
    }
}

impl From<DocumentOwnershipError> for FileWriteError {
    fn from(error: DocumentOwnershipError) -> Self {
        Self::Ownership(error)
    }
}

impl Serialize for FileWriteError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Payload {
            kind: &'static str,
            message: String,
        }

        Payload {
            kind: match self {
                Self::Conflict(_) => "conflict",
                Self::Ownership(DocumentOwnershipError::AlreadyOpen { .. }) => "alreadyOpen",
                _ => "io",
            },
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

impl FileWriteError {
    fn conflict(path: &Path) -> Self {
        Self::Conflict(format!(
            "The file changed on disk before it could be saved: '{}'.",
            path.display()
        ))
    }

    pub(crate) fn io(path: &Path, error: io::Error) -> Self {
        Self::Io(format!("Failed to save '{}': {error}", path.display()))
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub(crate) enum FileReadError {
    Io(String),
    UnsupportedEncoding(String),
}

impl std::fmt::Display for FileReadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(message) | Self::UnsupportedEncoding(message) => formatter.write_str(message),
        }
    }
}

#[tauri::command]
pub(crate) async fn read_text_file(
    path: String,
    encoding: Option<TextEncoding>,
) -> Result<FileReadResult, FileReadError> {
    tauri::async_runtime::spawn_blocking(move || read_from_path(path, encoding))
        .await
        .map_err(|error| FileReadError::Io(error.to_string()))?
}

#[tauri::command]
pub(crate) async fn write_text_file<R: Runtime>(
    path: String,
    content: String,
    options: Option<FileWriteOptions>,
    tab_id: Option<String>,
    window: WebviewWindow<R>,
) -> Result<FileWriteResult, FileWriteError> {
    tauri::async_runtime::spawn_blocking(move || {
        let owners = window.state::<DocumentOwners>();
        let result = owners.with_write_target(
            window.label(),
            tab_id.as_deref(),
            Path::new(&path),
            |target| write_atomic(target, path.clone(), &content, options.unwrap_or_default()),
        );
        if let Err(FileWriteError::Ownership(DocumentOwnershipError::AlreadyOpen {
            owner, ..
        })) = &result
        {
            activate_document_owner(window.app_handle(), owner);
        }
        result
    })
    .await
    .map_err(|error| FileWriteError::Io(error.to_string()))?
}

pub fn write_text_file_to_path(path: String, content: String) -> Result<FileWriteResult, String> {
    let target = canonical_document_path(Path::new(&path))
        .map_err(|error| FileWriteError::io(Path::new(&path), error).to_string())?;
    write_atomic(&target, path, &content, FileWriteOptions::default())
        .map_err(|error| error.to_string())
}

pub fn read_text_file_from_path(path: String) -> Result<FileReadResult, String> {
    read_from_path(path, None).map_err(|error| error.to_string())
}

pub(crate) fn read_from_path(
    path: String,
    encoding: Option<TextEncoding>,
) -> Result<FileReadResult, FileReadError> {
    let Some((bytes, metadata)) = read_existing(Path::new(&path)).map_err(|error| {
        FileReadError::Io(format!("Failed to read text file '{path}': {error}"))
    })?
    else {
        return Ok(FileReadResult {
            path,
            content: String::new(),
            exists: false,
            encoding: TextEncoding::Utf8,
            line_ending: LineEnding::Lf,
            last_modified_at: None,
        });
    };

    let (content, encoding) = decode_text(&bytes, encoding).map_err(|error| {
        FileReadError::UnsupportedEncoding(format!("Failed to read text file '{path}': {error}"))
    })?;
    Ok(FileReadResult {
        path,
        line_ending: detect_line_ending(&content),
        content,
        exists: true,
        encoding,
        last_modified_at: modified_at_ms(&metadata),
    })
}

fn read_existing(path: &Path) -> io::Result<Option<(Vec<u8>, fs::Metadata)>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "expected a regular file",
        ));
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(Some((bytes, file.metadata()?)))
}

pub(crate) fn write_atomic(
    path: &Path,
    display_path: String,
    content: &str,
    options: FileWriteOptions,
) -> Result<FileWriteResult, FileWriteError> {
    let directory = path.parent().ok_or_else(|| {
        FileWriteError::Io(format!("Missing parent directory for '{display_path}'."))
    })?;
    let mut temporary =
        NamedTempFile::new_in(directory).map_err(|error| FileWriteError::io(path, error))?;
    temporary
        .write_all(
            &encode_text(content, options.encoding)
                .map_err(|error| FileWriteError::Io(error.into()))?,
        )
        .map_err(|error| FileWriteError::io(path, error))?;

    let current = read_existing(path).map_err(|error| FileWriteError::io(path, error))?;
    match (&options.expected, &current) {
        (Some(FileWriteExpectation::Present { content, encoding }), Some((bytes, _)))
            if encode_text(content, *encoding).is_ok_and(|expected| *bytes == expected) => {}
        (Some(FileWriteExpectation::Missing), None) | (None, _) => {}
        _ => return Err(FileWriteError::conflict(path)),
    }

    if let Some((_, metadata)) = &current {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| FileWriteError::io(path, error))?;
    }
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| FileWriteError::io(path, error))?;
    let last_modified_at = temporary
        .as_file()
        .metadata()
        .ok()
        .and_then(|metadata| modified_at_ms(&metadata));

    // Check the actual bytes again after the temp-file sync, immediately before replacement.
    if let Some((bytes, _)) = current {
        if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_symlink()) {
            return Err(FileWriteError::conflict(path));
        }
        let still_current = read_existing(path)
            .map_err(|error| FileWriteError::io(path, error))?
            .is_some_and(|(current_bytes, _)| current_bytes == bytes);
        if !still_current {
            return Err(FileWriteError::conflict(path));
        }
        temporary
            .persist(path)
            .map_err(|error| FileWriteError::io(path, error.error))?;
    } else {
        temporary.persist_noclobber(path).map_err(|error| {
            if error.error.kind() == io::ErrorKind::AlreadyExists {
                FileWriteError::conflict(path)
            } else {
                FileWriteError::io(path, error.error)
            }
        })?;
    }

    Ok(FileWriteResult {
        path: display_path,
        encoding: options.encoding,
        line_ending: detect_line_ending(content),
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

fn modified_at_ms(metadata: &fs::Metadata) -> Option<u64> {
    let epoch = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(epoch.as_millis()).ok()
}

const UNSUPPORTED_ENCODING: &str =
    "Unsupported or invalid encoding. If this is a legacy Cyrillic document, try Windows-1251.";

fn decode_text(
    bytes: &[u8],
    explicit_encoding: Option<TextEncoding>,
) -> Result<(String, TextEncoding), &'static str> {
    if bytes.starts_with(&[0xff, 0xfe, 0, 0]) || bytes.starts_with(&[0, 0, 0xfe, 0xff]) {
        return Err(UNSUPPORTED_ENCODING);
    }
    if let Some(bytes) = bytes.strip_prefix(&[0xff, 0xfe]) {
        return decode_utf16(bytes, u16::from_le_bytes)
            .map(|content| (content, TextEncoding::Utf16Le));
    }
    if let Some(bytes) = bytes.strip_prefix(&[0xfe, 0xff]) {
        return decode_utf16(bytes, u16::from_be_bytes)
            .map(|content| (content, TextEncoding::Utf16Be));
    }
    if bytes.contains(&0) {
        return Err(UNSUPPORTED_ENCODING);
    }
    let (bytes, encoding) = match bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        Some(bytes) => (bytes, TextEncoding::Utf8Bom),
        None if explicit_encoding == Some(TextEncoding::Windows1251) => {
            return WINDOWS_1251
                .decode_without_bom_handling_and_without_replacement(bytes)
                .map(|content| (content.into_owned(), TextEncoding::Windows1251))
                .ok_or(UNSUPPORTED_ENCODING);
        }
        None => (bytes, TextEncoding::Utf8),
    };
    String::from_utf8(bytes.to_vec())
        .map(|content| (content, encoding))
        .map_err(|_| UNSUPPORTED_ENCODING)
}

fn decode_utf16(bytes: &[u8], decode_unit: fn([u8; 2]) -> u16) -> Result<String, &'static str> {
    let (pairs, remainder) = bytes.as_chunks::<2>();
    if !remainder.is_empty() {
        return Err(UNSUPPORTED_ENCODING);
    }
    char::decode_utf16(pairs.iter().copied().map(decode_unit))
        .collect::<Result<String, _>>()
        .map_err(|_| UNSUPPORTED_ENCODING)
}

fn encode_text(content: &str, encoding: TextEncoding) -> Result<Vec<u8>, &'static str> {
    let bytes = match encoding {
        TextEncoding::Utf8 => content.as_bytes().to_vec(),
        TextEncoding::Utf8Bom => {
            let mut bytes = vec![0xef, 0xbb, 0xbf];
            bytes.extend_from_slice(content.as_bytes());
            bytes
        }
        TextEncoding::Utf16Le => {
            let mut bytes = vec![0xff, 0xfe];
            bytes.extend(content.encode_utf16().flat_map(u16::to_le_bytes));
            bytes
        }
        TextEncoding::Utf16Be => {
            let mut bytes = vec![0xfe, 0xff];
            bytes.extend(content.encode_utf16().flat_map(u16::to_be_bytes));
            bytes
        }
        TextEncoding::Windows1251 => {
            let (bytes, _, unmappable) = WINDOWS_1251.encode(content);
            if unmappable {
                return Err("The document contains characters Windows-1251 cannot represent. Copy the text into a new UTF-8 document to save all characters.");
            }
            bytes.into_owned()
        }
    };
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_commands_share_the_camel_case_ipc_contract_with_the_webview() {
        use serde_json::{json, Value};
        use tauri::{
            ipc::{CallbackFn, InvokeBody},
            test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY},
            webview::InvokeRequest,
        };

        let app = mock_builder()
            .manage(DocumentOwners::default())
            .invoke_handler(tauri::generate_handler![read_text_file, write_text_file])
            .build(mock_context(noop_assets()))
            .expect("mock app");
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("mock webview");
        let invoke = |command: &str, body: Value| {
            get_ipc_response(
                &window,
                InvokeRequest {
                    cmd: command.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: if cfg!(windows) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .expect("IPC URL"),
                    body: InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.into(),
                },
            )
            .and_then(|response| {
                response
                    .deserialize::<Value>()
                    .map_err(|error| json!(error.to_string()))
            })
        };

        let directory = tempfile::tempdir().expect("test directory");
        let path = directory.path().join("legacy.md");
        let path = path.to_str().expect("UTF-8 test path");
        fs::write(path, [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]).expect("legacy document");

        let error =
            invoke("read_text_file", json!({ "path": path })).expect_err("automatic read fails");
        assert_eq!(error["kind"], "unsupportedEncoding");
        let read = invoke(
            "read_text_file",
            json!({ "path": path, "encoding": "windows1251" }),
        )
        .expect("explicit legacy read");
        assert_eq!(read["content"], "Привет");
        assert_eq!(read["exists"], true);
        assert_eq!(read["lineEnding"], "lf");
        assert_eq!(read["encoding"], "windows1251");

        let write = invoke("write_text_file", json!({
            "path": path,
            "content": "Мир\r\n",
            "tabId": "tab-1",
            "options": {
                "encoding": "windows1251",
                "expected": { "kind": "present", "content": "Привет", "encoding": "windows1251" },
            },
        })).expect("guarded legacy write");
        assert_eq!(write["encoding"], "windows1251");
        assert_eq!(write["lineEnding"], "crlf");
        assert_eq!(
            fs::read(path).expect("read saved bytes"),
            [0xcc, 0xe8, 0xf0, 0x0d, 0x0a]
        );
    }

    #[test]
    fn expected_bytes_protect_edits_when_the_file_is_still_present() {
        let directory = tempfile::tempdir().expect("test directory");
        let path = directory.path().join("notes.md");
        fs::write(&path, "External edit").expect("write external edit");

        let result = write_atomic(
            &path,
            path.display().to_string(),
            "Local edit",
            FileWriteOptions {
                encoding: TextEncoding::Utf8,
                expected: Some(FileWriteExpectation::Present {
                    content: "Saved base".into(),
                    encoding: TextEncoding::Utf8,
                }),
            },
        );

        assert!(matches!(result, Err(FileWriteError::Conflict(_))));
        assert_eq!(
            fs::read_to_string(&path).expect("read external edit"),
            "External edit"
        );
        assert_eq!(
            fs::read_dir(directory.path())
                .expect("directory entries")
                .count(),
            1
        );
    }

    #[test]
    fn expected_missing_path_never_replaces_an_existing_file() {
        let directory = tempfile::tempdir().expect("test directory");
        let path = directory.path().join("notes.md");
        fs::write(&path, "Created elsewhere").expect("create existing file");

        let result = write_atomic(
            &path,
            path.display().to_string(),
            "Draft",
            FileWriteOptions {
                expected: Some(FileWriteExpectation::Missing),
                ..FileWriteOptions::default()
            },
        );

        assert!(matches!(result, Err(FileWriteError::Conflict(_))));
        assert_eq!(
            fs::read_to_string(&path).expect("read original"),
            "Created elsewhere"
        );
    }

    #[test]
    fn unicode_bom_encodings_round_trip_without_replacing_bytes() {
        for encoding in [
            TextEncoding::Utf8Bom,
            TextEncoding::Utf16Le,
            TextEncoding::Utf16Be,
        ] {
            let content = "Привет 🌍\r\n";
            let original_bytes = encode_text(content, encoding).expect("encode original");
            assert_eq!(
                decode_text(&original_bytes, None).expect("decode original"),
                (content.into(), encoding)
            );
        }
        assert!(decode_text(&[0xff, 0xfe, 0x23], None).is_err());
        assert!(decode_text(&[0xd0, 0xe0], None).is_err());
    }
    #[test]
    fn windows_1251_requires_an_explicit_choice_and_rejects_lossy_writes() {
        let russian = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2];
        assert!(decode_text(&russian, None).is_err());
        assert_eq!(
            decode_text(&russian, Some(TextEncoding::Windows1251)).expect("decode legacy text"),
            ("Привет".into(), TextEncoding::Windows1251)
        );
        assert_eq!(
            encode_text("Привет", TextEncoding::Windows1251).expect("encode legacy text"),
            russian
        );
        assert!(encode_text("Привет 🌍", TextEncoding::Windows1251).is_err());
    }
}
