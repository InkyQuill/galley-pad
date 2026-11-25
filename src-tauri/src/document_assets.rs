use std::path::{Component, Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ReferenceKind {
    Image,
    Document,
}

fn local_reference(
    document_path: &Path,
    relative_path: &Path,
    kind: ReferenceKind,
) -> Option<PathBuf> {
    if !document_path.is_absolute()
        || relative_path.as_os_str().is_empty()
        || relative_path
            .components()
            .any(|component| matches!(component, Component::Prefix(_) | Component::RootDir))
    {
        return None;
    }

    let directory = document_path.parent()?.canonicalize().ok()?;
    let target = directory.join(relative_path).canonicalize().ok()?;
    if !target.starts_with(&directory) || !target.is_file() {
        return None;
    }

    let extension = target.extension()?.to_str()?.to_ascii_lowercase();
    let supported = match kind {
        ReferenceKind::Image => matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico"
        ),
        ReferenceKind::Document => matches!(extension.as_str(), "md" | "markdown" | "txt"),
    };
    supported.then_some(target)
}

#[tauri::command]
pub(crate) async fn resolve_document_reference(
    app: AppHandle,
    document_path: String,
    relative_path: String,
    kind: ReferenceKind,
) -> Result<Option<String>, String> {
    let target = tauri::async_runtime::spawn_blocking(move || {
        local_reference(Path::new(&document_path), Path::new(&relative_path), kind)
    })
    .await
    .map_err(|error| format!("Unable to resolve the document reference: {error}"))?;

    let Some(target) = target else {
        return Ok(None);
    };

    if matches!(kind, ReferenceKind::Image) {
        app.asset_protocol_scope()
            .allow_file(&target)
            .map_err(|error| format!("Unable to allow the document image: {error}"))?;
    }
    Ok(target.into_os_string().into_string().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolves_only_existing_files_of_the_requested_kind_inside_the_document_folder() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let folder = root.join("draft");
        let images = folder.join("images");
        fs::create_dir_all(&images).unwrap();
        let doc = folder.join("draft.md");
        let image = images.join("example.PNG");
        let note = folder.join("note.md");
        fs::write(&image, b"").unwrap();
        fs::write(&note, b"").unwrap();
        fs::write(root.join("outside.png"), b"").unwrap();

        let resolve = |relative: &str, kind| local_reference(&doc, Path::new(relative), kind);
        assert_eq!(
            resolve("images/example.PNG", ReferenceKind::Image),
            Some(image.canonicalize().unwrap())
        );
        assert_eq!(
            resolve("note.md", ReferenceKind::Document),
            Some(note.canonicalize().unwrap())
        );
        assert!(resolve("note.md", ReferenceKind::Image).is_none());
        assert!(resolve("../outside.png", ReferenceKind::Image).is_none());
        assert!(resolve("images/missing.png", ReferenceKind::Image).is_none());

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("outside.png"), folder.join("link.png")).unwrap();
            assert!(resolve("link.png", ReferenceKind::Image).is_none());
        }
    }
}
