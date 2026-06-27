use galley_pad_lib::{read_text_file_from_path, write_text_file_to_path, LineEnding};
use serde_json::Value;

#[test]
fn text_file_commands_round_trip_markdown_content() {
    let directory = tempfile::tempdir().expect("create temp dir");
    let path = directory.path().join("document.md");
    let path = path.to_string_lossy().into_owned();

    let write_result = write_text_file_to_path(path.clone(), "# Hello\r\n\r\nBody\r\n".to_string())
        .expect("write file");

    assert_eq!(write_result.path, path);
    assert_eq!(write_result.line_ending, LineEnding::Crlf);
    assert!(write_result.last_modified_at.is_some());

    let read_result = read_text_file_from_path(path.clone()).expect("read file");

    assert_eq!(read_result.path, path);
    assert_eq!(read_result.content, "# Hello\r\n\r\nBody\r\n");
    assert_eq!(read_result.line_ending, LineEnding::Crlf);
    assert!(read_result.last_modified_at.is_some());
}

#[test]
fn tauri_config_declares_installable_markdown_file_associations() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri config should be valid json");
    assert_cli_alias_is_safe(&config);

    let bundle = config
        .get("bundle")
        .and_then(Value::as_object)
        .expect("bundle config should exist");

    assert_eq!(bundle.get("active").and_then(Value::as_bool), Some(true));

    let icons = bundle
        .get("icon")
        .and_then(Value::as_array)
        .expect("bundle icons should exist");
    assert!(icons.iter().any(|icon| icon == "icons/128x128.png"));
    assert!(icons.iter().any(|icon| icon == "icons/icon.icns"));
    assert!(icons.iter().any(|icon| icon == "icons/icon.ico"));

    let associations = bundle
        .get("fileAssociations")
        .and_then(Value::as_array)
        .expect("file associations should exist");
    let markdown = associations
        .iter()
        .find(|association| {
            association
                .get("ext")
                .and_then(Value::as_array)
                .is_some_and(|ext| {
                    ext.iter().any(|value| value == "md")
                        && ext.iter().any(|value| value == "markdown")
                })
        })
        .expect("markdown file association should exist");

    assert_eq!(
        markdown.get("mimeType").and_then(Value::as_str),
        Some("text/markdown")
    );
    assert_eq!(
        markdown.get("description").and_then(Value::as_str),
        Some("Markdown Document")
    );
    assert_eq!(markdown.get("role").and_then(Value::as_str), Some("Editor"));

    let content_types = markdown
        .get("contentTypes")
        .and_then(Value::as_array)
        .expect("macOS content types should exist");
    assert!(
        content_types
            .iter()
            .any(|value| value == "net.daringfireball.markdown"),
        "macOS Markdown content type should be declared"
    );
    assert!(
        content_types
            .iter()
            .any(|value| value == "public.plain-text"),
        "macOS plain-text conformance should be declared"
    );

    let capability: Value = serde_json::from_str(include_str!("../capabilities/default.json"))
        .expect("default capability should be valid json");
    let windows = capability
        .get("windows")
        .and_then(Value::as_array)
        .expect("default capability should list allowed windows");
    assert!(windows.iter().any(|value| value == "main"));
    assert!(
        windows.iter().any(|value| value == "markdown-file-*"),
        "dynamic Markdown file windows should receive default app permissions"
    );

    let cargo_manifest = include_str!("../Cargo.toml");
    assert!(
        cargo_manifest.contains("tauri-plugin-single-instance"),
        "single-instance plugin should be declared for OS file-open process routing"
    );
}

fn assert_cli_alias_is_safe(config: &Value) {
    let alias = config
        .get("mainBinaryName")
        .and_then(Value::as_str)
        .expect("main binary name should be configured");

    assert_eq!(alias, "gpad");
    assert_ne!(
        alias, "pad",
        "avoid generic command names with higher collision risk"
    );
    assert!(
        !windows_reserved_names().contains(&alias.to_ascii_uppercase().as_str()),
        "alias should not use a Windows reserved device name"
    );
}

fn windows_reserved_names() -> &'static [&'static str] {
    &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
}
