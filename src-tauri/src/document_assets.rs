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
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico" | "svg"
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
        let svg = images.join("chart.svg");
        fs::write(&svg, "<svg/>").unwrap();
        assert_eq!(
            resolve("images/chart.svg", ReferenceKind::Image),
            Some(svg.canonicalize().unwrap())
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

#[cfg(test)]
mod watch_tests {
    use super::*;
    use std::{fs, sync::mpsc, time::Duration};

    #[test]
    fn observes_creation_of_a_missing_image_in_a_nested_directory() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("images");
        fs::create_dir(&folder).unwrap();
        let document = dir.path().join("draft.md");
        let (sender, receiver) = mpsc::channel();
        let _watch = watch_images(&document, &["images/chart.svg".into()], move || {
            let _ = sender.send(());
        })
        .unwrap();
        fs::write(folder.join("chart.svg"), "<svg/>").unwrap();
        receiver.recv_timeout(Duration::from_secs(3)).unwrap();
    }
}

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{State, WebviewWindow};

#[derive(Default)]
pub(crate) struct ImageWatches(Mutex<HashMap<(String, String), RecommendedWatcher>>);

impl ImageWatches {
    pub(crate) fn remove_window(&self, label: &str) {
        if let Ok(mut entries) = self.0.lock() {
            entries.retain(|(window, _), _| window != label);
        }
    }
}

fn watch_images(
    document: &Path,
    paths: &[String],
    changed: impl Fn() + Send + 'static,
) -> Result<RecommendedWatcher, String> {
    let root = document
        .parent()
        .ok_or("Missing document directory")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let mut targets = HashSet::new();
    let mut directories = HashSet::new();
    for relative in paths {
        let relative = Path::new(relative);
        if relative.is_absolute() {
            continue;
        }
        let path = root.join(relative);
        // Watch the nearest existing parent so creating a missing subdirectory
        // can refresh its references. Resolve symlinks before authorizing it.
        if let Some(parent) = path.ancestors().skip(1).find(|p| p.is_dir()) {
            let Ok(directory) = parent.canonicalize() else {
                continue;
            };
            if !directory.starts_with(&root) {
                continue;
            }
            let Ok(rest) = path.strip_prefix(parent) else {
                continue;
            };
            if rest
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
            {
                continue;
            }
            targets.insert(directory.join(rest));
            directories.insert(directory);
        }
    }
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.as_ref().map_or(true, |event| {
            !matches!(event.kind, EventKind::Access(_))
                && (event.need_rescan()
                    || event
                        .paths
                        .iter()
                        .any(|p| targets.iter().any(|target| target.starts_with(p))))
        }) {
            changed();
        }
    })
    .map_err(|e| e.to_string())?;
    for dir in directories {
        watcher
            .watch(&dir, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
    }
    Ok(watcher)
}

#[tauri::command]
pub(crate) fn watch_document_images(
    window: WebviewWindow,
    watches: State<'_, ImageWatches>,
    subscription: String,
    document_path: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let key = (window.label().to_owned(), subscription.clone());
    let mut entries = watches.0.lock().map_err(|_| "Image watcher unavailable")?;
    if paths.is_empty() {
        entries.remove(&key);
    } else {
        let watcher = watch_images(Path::new(&document_path), &paths, move || {
            let _ = super::window_events::emit_editor_event(
                &window,
                "document-images-changed",
                &subscription,
            );
        })?;
        entries.insert(key, watcher);
    }
    Ok(())
}
