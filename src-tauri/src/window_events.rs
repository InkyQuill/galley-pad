use serde::Serialize;
use tauri::{Emitter, Runtime, WebviewWindow};

pub(super) fn emit_editor_event<R: Runtime, S: Serialize + Clone>(
    window: &WebviewWindow<R>,
    event: &str,
    payload: S,
) -> tauri::Result<()> {
    window.emit_to(window.label(), event, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tauri::{Listener, WebviewUrl, WebviewWindowBuilder};

    #[test]
    fn window_events_reach_only_the_intended_recipient() {
        let app = tauri::test::mock_app();
        let first = WebviewWindowBuilder::new(&app, "first", WebviewUrl::default())
            .build()
            .unwrap();
        let second = WebviewWindowBuilder::new(&app, "second", WebviewUrl::default())
            .build()
            .unwrap();
        let received = Arc::new(Mutex::new(Vec::new()));
        for (window, name) in [(&first, "first"), (&second, "second")] {
            let received = received.clone();
            window.listen("app-quit-check", move |_| {
                received.lock().unwrap().push(name)
            });
        }

        emit_editor_event(&first, "app-quit-check", 1u64).unwrap();
        emit_editor_event(&second, "app-quit-check", 1u64).unwrap();
        assert_eq!(*received.lock().unwrap(), ["first", "second"]);
    }
}
