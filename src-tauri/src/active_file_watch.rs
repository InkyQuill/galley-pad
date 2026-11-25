use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{State, WebviewWindow};

use crate::document_ownership::canonical_document_path;

#[derive(Default)]
pub(super) struct ActiveFileWatches(Mutex<HashMap<String, RecommendedWatcher>>);

impl ActiveFileWatches {
    pub(super) fn remove(&self, label: &str) {
        if let Ok(mut watchers) = self.0.lock() {
            watchers.remove(label);
        }
    }
}

fn event_may_change_file(event: &Event, path: &Path) -> bool {
    !matches!(event.kind, EventKind::Access(_))
        && (event.need_rescan() || event.paths.iter().any(|changed| changed == path))
}

fn watch_parent(
    path: PathBuf,
    notify_window: impl Fn() + Send + 'static,
) -> Result<RecommendedWatcher, String> {
    let parent = path
        .parent()
        .ok_or("Document has no parent directory")?
        .to_path_buf();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
        // A missed event or watcher overflow should trigger a full document check.
        if event
            .as_ref()
            .map_or(true, |event| event_may_change_file(event, &path))
        {
            notify_window();
        }
    })
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|error| error.to_string())?;
    Ok(watcher)
}

#[tauri::command]
pub(super) fn watch_active_document(
    window: WebviewWindow,
    watches: State<'_, ActiveFileWatches>,
    path: Option<String>,
) -> Result<(), String> {
    let mut active = watches
        .0
        .lock()
        .map_err(|_| "Document watcher is unavailable")?;
    let label = window.label().to_owned();
    active.remove(&label);
    if let Some(path) = path {
        let watched_path =
            canonical_document_path(Path::new(&path)).map_err(|error| error.to_string())?;
        let watcher = watch_parent(watched_path, move || {
            let _ =
                super::window_events::emit_editor_event(&window, "active-document-changed", &path);
        })?;
        active.insert(label, watcher);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directory_watcher_filters_unrelated_paths_and_observes_both_rename_ends() {
        let path = PathBuf::from("/drafts/title.md");
        let sibling = PathBuf::from("/drafts/other.md");
        assert!(!event_may_change_file(
            &Event::new(EventKind::Any).add_path(sibling.clone()),
            &path
        ));
        assert!(!event_may_change_file(
            &Event::new(EventKind::Access(notify::event::AccessKind::Any)).add_path(path.clone()),
            &path
        ));
        assert!(event_may_change_file(
            &Event::new(EventKind::Modify(notify::event::ModifyKind::Name(
                notify::event::RenameMode::Both,
            )))
            .add_path(sibling)
            .add_path(path.clone()),
            &path,
        ));
    }

    #[test]
    fn watcher_reports_replacing_the_active_document() {
        use std::{fs, sync::mpsc, time::Duration};
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("draft.md");
        let temporary = directory.path().join("draft.tmp");
        fs::write(&file, "before").unwrap();
        let (changed, listener) = mpsc::channel();
        let _watcher = watch_parent(canonical_document_path(&file).unwrap(), move || {
            let _ = changed.send(());
        })
        .unwrap();
        fs::write(&temporary, "after").unwrap();
        #[cfg(windows)]
        fs::remove_file(&file).unwrap();
        fs::rename(&temporary, &file).unwrap();
        listener.recv_timeout(Duration::from_secs(5)).unwrap();
    }
}
