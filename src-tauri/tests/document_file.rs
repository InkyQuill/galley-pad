#[cfg(unix)]
#[test]
fn atomic_save_dereferences_the_link_and_preserves_target_permissions() {
    use galley_pad_lib::{read_text_file_from_path, write_text_file_to_path};
    use std::{
        fs,
        os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    };

    let directory = tempfile::tempdir().expect("test directory");
    let target = directory.path().join("notes.md");
    let alias = directory.path().join("alias.md");
    fs::write(&target, "Original").expect("write initial document");
    fs::set_permissions(&target, fs::Permissions::from_mode(0o640)).expect("set mode");
    symlink("notes.md", &alias).expect("create document alias");

    let original = fs::metadata(&target).expect("document metadata");
    assert!(
        read_text_file_from_path(alias.display().to_string())
            .expect("read alias")
            .exists
    );
    write_text_file_to_path(alias.display().to_string(), "Updated".into())
        .expect("save through alias");

    assert_eq!(
        fs::read_to_string(&target).expect("read updated document"),
        "Updated"
    );
    assert!(fs::symlink_metadata(alias)
        .expect("link metadata")
        .is_symlink());
    let saved = fs::metadata(&target).expect("saved metadata");
    assert_eq!(saved.permissions().mode() & 0o777, 0o640);
    assert_ne!(saved.ino(), original.ino());
}

#[cfg(unix)]
#[test]
fn atomic_save_refuses_to_replace_a_dangling_link() {
    use galley_pad_lib::write_text_file_to_path;
    use std::{fs, os::unix::fs::symlink};

    let directory = tempfile::tempdir().expect("test directory");
    let alias = directory.path().join("broken.md");
    symlink("missing.md", &alias).expect("create dangling link");

    assert!(write_text_file_to_path(alias.display().to_string(), "New".into()).is_err());
    assert!(fs::symlink_metadata(alias)
        .expect("link metadata")
        .is_symlink());
}
