use galley_pad_lib::{read_text_file_from_path, write_text_file_to_path, LineEnding};

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
