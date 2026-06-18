use std::fs;

#[test]
fn rust_integration_tests_can_use_temp_files() {
    let directory = tempfile::tempdir().expect("create temp dir");
    let path = directory.path().join("document.md");

    fs::write(&path, "# Hello\n").expect("write test markdown");

    let content = fs::read_to_string(&path).expect("read test markdown");
    assert_eq!(content, "# Hello\n");
}
