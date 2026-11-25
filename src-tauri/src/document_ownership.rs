use serde::Serialize;
use std::{
    collections::HashMap,
    fmt, fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

const ACTIVATE_DOCUMENT_EVENT: &str = "activate-document-tab";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentOwner {
    pub window_label: String,
    pub tab_id: Option<String>,
}

#[derive(Debug)]
pub(crate) enum DocumentOwnershipError {
    Io(io::Error),
    AlreadyOpen { path: PathBuf, owner: DocumentOwner },
    RegistryUnavailable,
}

impl fmt::Display for DocumentOwnershipError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(f),
            Self::AlreadyOpen { path, .. } => write!(
                f,
                "This document is already open: {}. Switch to its tab or choose another path.",
                path.display()
            ),
            Self::RegistryUnavailable => f.write_str("Open document registry is unavailable"),
        }
    }
}

impl From<io::Error> for DocumentOwnershipError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Default)]
pub(crate) struct DocumentOwners(Mutex<HashMap<PathBuf, DocumentOwner>>);

impl DocumentOwners {
    fn lock(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<PathBuf, DocumentOwner>>, DocumentOwnershipError> {
        self.0
            .lock()
            .map_err(|_| DocumentOwnershipError::RegistryUnavailable)
    }

    pub(crate) fn claim(
        &self,
        window_label: &str,
        tab_id: Option<&str>,
        path: &Path,
    ) -> Result<PathBuf, DocumentOwnershipError> {
        let path = canonical_document_path(path)?;
        let mut owners = self.lock()?;
        if let Some(owner) = owners.get(&path) {
            if owner.window_label != window_label
                || (owner.tab_id.is_some() && owner.tab_id.as_deref() != tab_id)
            {
                return Err(DocumentOwnershipError::AlreadyOpen {
                    path,
                    owner: owner.clone(),
                });
            }
        }
        owners.insert(
            path.clone(),
            DocumentOwner {
                window_label: window_label.to_owned(),
                tab_id: tab_id.map(str::to_owned),
            },
        );
        Ok(path)
    }

    pub(crate) fn with_write_target<T, E: From<DocumentOwnershipError>>(
        &self,
        window_label: &str,
        tab_id: Option<&str>,
        path: &Path,
        write: impl FnOnce(&Path) -> Result<T, E>,
    ) -> Result<T, E> {
        let path = canonical_document_path(path).map_err(DocumentOwnershipError::from)?;
        let mut owners = self.lock()?;
        if let Some(owner) = owners.get(&path) {
            let owns_target = tab_id.is_some()
                && owner.window_label == window_label
                && owner.tab_id.as_deref() == tab_id;
            if !owns_target {
                return Err(DocumentOwnershipError::AlreadyOpen {
                    path,
                    owner: owner.clone(),
                }
                .into());
            }
        }
        // Hold the registry guard until the atomic write finishes, so no other
        // window can claim this destination while Save As is in progress.
        let result = write(&path)?;
        if let Some(tab_id) = tab_id {
            owners.retain(|_, owner| {
                owner.window_label != window_label || owner.tab_id.as_deref() != Some(tab_id)
            });
            owners.insert(
                path,
                DocumentOwner {
                    window_label: window_label.to_owned(),
                    tab_id: Some(tab_id.to_owned()),
                },
            );
        }
        Ok(result)
    }

    pub(crate) fn release(
        &self,
        window_label: &str,
        tab_id: Option<&str>,
    ) -> Result<(), DocumentOwnershipError> {
        self.lock()?.retain(|_, owner| {
            owner.window_label != window_label
                || tab_id.is_some_and(|tab_id| owner.tab_id.as_deref() != Some(tab_id))
        });
        Ok(())
    }
}

pub(crate) fn canonical_document_path(path: &Path) -> io::Result<PathBuf> {
    match fs::canonicalize(path) {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            // A dangling symlink is an existing filesystem entry. Do not swap it
            // out for a regular file if its target is unavailable.
            if fs::symlink_metadata(path).is_ok() {
                return Err(error);
            }
            let parent = path
                .parent()
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or_else(|| Path::new("."));
            let name = path.file_name().ok_or(error)?;
            Ok(fs::canonicalize(parent)?.join(name))
        }
        Err(error) => Err(error),
    }
}

pub(crate) fn activate_document_owner<R: tauri::Runtime>(
    app: &AppHandle<R>,
    owner: &DocumentOwner,
    fragment: Option<&str>,
) {
    if let Some(window) = app.get_webview_window(&owner.window_label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(tab_id) = &owner.tab_id {
            if let Some(fragment) = fragment {
                let _ = super::window_events::emit_editor_event(
                    &window,
                    ACTIVATE_DOCUMENT_EVENT,
                    serde_json::json!({ "tabId": tab_id, "fragment": fragment }),
                );
            } else {
                let _ = super::window_events::emit_editor_event(
                    &window,
                    ACTIVATE_DOCUMENT_EVENT,
                    tab_id,
                );
            }
        }
    }
}

#[tauri::command]
pub(crate) fn claim_document_path(
    window: WebviewWindow,
    owners: State<'_, DocumentOwners>,
    path: String,
    tab_id: String,
    fragment: Option<String>,
) -> Result<Option<String>, String> {
    match owners.claim(window.label(), Some(&tab_id), Path::new(&path)) {
        Ok(path) => path
            .into_os_string()
            .into_string()
            .map(Some)
            .map_err(|_| "Document path is not valid Unicode".into()),
        Err(DocumentOwnershipError::AlreadyOpen { owner, .. }) => {
            activate_document_owner(window.app_handle(), &owner, fragment.as_deref());
            Ok(None)
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub(crate) fn release_document_tab(
    window: WebviewWindow,
    owners: State<'_, DocumentOwners>,
    tab_id: String,
) -> Result<(), String> {
    owners
        .release(window.label(), Some(&tab_id))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claims_are_shared_and_released_per_window_and_tab() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("draft.md");
        let owners = DocumentOwners::default();
        owners.claim("main", Some("one"), &path).unwrap();
        assert!(matches!(
            owners.claim("other", Some("two"), &path),
            Err(DocumentOwnershipError::AlreadyOpen { owner, .. }) if owner.window_label == "main"
        ));
        owners.release("other", None).unwrap();
        assert!(owners.claim("other", Some("two"), &path).is_err());
        owners.release("main", Some("one")).unwrap();
        assert!(owners.claim("other", Some("two"), &path).is_ok());
    }

    #[test]
    fn save_as_never_overwrites_an_open_target_and_only_moves_on_success() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("original.md");
        let target = temp.path().join("other.md");
        let fresh = temp.path().join("copy.md");
        let owners = DocumentOwners::default();
        owners.claim("main", Some("one"), &path).unwrap();
        owners.claim("main", Some("two"), &target).unwrap();
        let blocked: Result<(), DocumentOwnershipError> =
            owners.with_write_target("main", Some("one"), &target, |_| {
                panic!("must not write an open document")
            });
        assert!(matches!(
            blocked,
            Err(DocumentOwnershipError::AlreadyOpen { .. })
        ));
        let failed: Result<(), DocumentOwnershipError> =
            owners.with_write_target("main", Some("one"), &fresh, |_| {
                Err(io::Error::other("disk full").into())
            });
        assert!(failed.is_err());
        assert!(owners.claim("other", Some("two"), &path).is_err());
        owners
            .with_write_target("main", Some("one"), &fresh, |_| {
                Ok::<_, DocumentOwnershipError>(())
            })
            .unwrap();
        assert!(owners.claim("other", Some("two"), &path).is_ok());
        assert!(owners.claim("other", Some("three"), &fresh).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn canonical_path_deduplicates_symlinks_and_rejects_dangling_links() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("draft.md");
        let link = temp.path().join("alias.md");
        fs::write(&path, "text").unwrap();
        std::os::unix::fs::symlink(&path, &link).unwrap();
        assert_eq!(
            canonical_document_path(&link).unwrap(),
            fs::canonicalize(&path).unwrap()
        );
        fs::remove_file(&path).unwrap();
        assert!(canonical_document_path(&link).is_err());
    }
}
