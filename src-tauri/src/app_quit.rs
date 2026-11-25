use std::{
    collections::{HashSet, VecDeque},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

const CHECK_EVENT: &str = "app-quit-check";
const CLEAR_EVENT: &str = "app-quit-clear";
const CHECK_TIMEOUT: Duration = Duration::from_secs(120);
const CLEAR_TIMEOUT: Duration = Duration::from_secs(10);
const CANCEL_EVENT: &str = "app-quit-cancelled";

#[derive(Default)]
pub(super) struct AppQuit(Mutex<QuitState>);

#[derive(Default)]
struct QuitState {
    ready: HashSet<String>,
    next_id: u64,
    request: Option<QuitRequest>,
    exit_approved: bool,
}

struct QuitRequest {
    id: u64,
    code: i32,
    phase: Phase,
}

enum Phase {
    Checking {
        pending: VecDeque<String>,
        approved: Vec<String>,
    },
    Clearing {
        pending: HashSet<String>,
    },
}

enum Step {
    Wait,
    Check(String, u64),
    Clear(Vec<String>, u64),
    Cancel(u64),
    Exit(i32),
}

impl QuitState {
    fn begin(&mut self, windows: Vec<String>, code: i32) -> Step {
        if self.request.is_some() {
            return Step::Wait;
        }
        let Some(first) = windows.first().cloned() else {
            return Step::Wait;
        };
        self.next_id += 1;
        self.request = Some(QuitRequest {
            id: self.next_id,
            code,
            phase: Phase::Checking {
                pending: windows.into(),
                approved: Vec::new(),
            },
        });
        Step::Check(first, self.next_id)
    }

    fn checked(&mut self, id: u64, label: &str, approved: bool) -> Step {
        let Some(request) = self.request.as_mut().filter(|request| request.id == id) else {
            return Step::Wait;
        };
        let Phase::Checking {
            pending,
            approved: accepted,
        } = &mut request.phase
        else {
            return Step::Wait;
        };
        if pending.front().map(String::as_str) != Some(label) {
            return Step::Wait;
        }
        if !approved {
            self.request = None;
            return Step::Cancel(id);
        }
        accepted.push(pending.pop_front().expect("current window checked"));
        if let Some(next) = pending.front() {
            return Step::Check(next.clone(), id);
        }
        let participants = std::mem::take(accepted);
        request.phase = Phase::Clearing {
            pending: participants.iter().cloned().collect(),
        };
        Step::Clear(participants, id)
    }

    fn expire_check(&mut self, id: u64, label: &str) -> Step {
        self.checked(id, label, false)
    }

    fn expire_clear(&mut self, id: u64) -> Step {
        if !self.request.as_ref().is_some_and(|request| {
            request.id == id && matches!(request.phase, Phase::Clearing { .. })
        }) {
            return Step::Wait;
        }
        let code = self.request.take().expect("active clear phase").code;
        self.exit_approved = true;
        Step::Exit(code)
    }

    fn window_destroyed(&mut self, label: &str) -> Step {
        self.ready.remove(label);
        let Some(request) = &self.request else {
            return Step::Wait;
        };
        let id = request.id;
        match &request.phase {
            Phase::Checking { pending, approved }
                if pending.iter().chain(approved).any(|window| window == label) =>
            {
                self.request = None;
                Step::Cancel(id)
            }
            Phase::Clearing { pending } if pending.contains(label) => self.cleared(id, label),
            _ => Step::Wait,
        }
    }

    fn cleared(&mut self, id: u64, label: &str) -> Step {
        let Some(request) = self.request.as_mut().filter(|request| request.id == id) else {
            return Step::Wait;
        };
        let Phase::Clearing { pending } = &mut request.phase else {
            return Step::Wait;
        };
        pending.remove(label);
        if !pending.is_empty() {
            return Step::Wait;
        }
        let code = request.code;
        self.request = None;
        self.exit_approved = true;
        Step::Exit(code)
    }
}

fn advance(app: &AppHandle, step: Step) {
    match step {
        Step::Wait => {}
        Step::Check(label, id) => {
            let delivered = app.get_webview_window(&label).is_some_and(|window| {
                let _ = window.unminimize();
                let _ = window.set_focus();
                super::window_events::emit_editor_event(&window, CHECK_EVENT, id).is_ok()
            });
            if delivered {
                let app = app.clone();
                thread::spawn(move || {
                    thread::sleep(CHECK_TIMEOUT);
                    let state = app.state::<AppQuit>();
                    let step = state
                        .0
                        .lock()
                        .map(|mut state| state.expire_check(id, &label));
                    if let Ok(step) = step {
                        advance(&app, step);
                    }
                });
            } else {
                let state = app.state::<AppQuit>();
                let next = state
                    .0
                    .lock()
                    .map(|mut state| state.checked(id, &label, false));
                if let Ok(next) = next {
                    advance(app, next);
                }
            }
        }
        Step::Clear(labels, id) => {
            let deadline_app = app.clone();
            thread::spawn(move || {
                thread::sleep(CLEAR_TIMEOUT);
                let state = deadline_app.state::<AppQuit>();
                let step = state.0.lock().map(|mut state| state.expire_clear(id));
                if let Ok(step) = step {
                    advance(&deadline_app, step);
                }
            });
            for label in labels {
                if !app.get_webview_window(&label).is_some_and(|window| {
                    super::window_events::emit_editor_event(&window, CLEAR_EVENT, id).is_ok()
                }) {
                    let state = app.state::<AppQuit>();
                    let next = state.0.lock().map(|mut state| state.cleared(id, &label));
                    if let Ok(next) = next {
                        advance(app, next);
                    }
                }
            }
        }
        Step::Cancel(id) => {
            let _ = app.emit(CANCEL_EVENT, id);
        }
        Step::Exit(code) => app.exit(code),
    }
}

pub(super) fn handle_window_destroyed(app: &AppHandle, label: &str) {
    let quit = app.state::<AppQuit>();
    let step = quit.0.lock().map(|mut state| state.window_destroyed(label));
    if let Ok(step) = step {
        advance(app, step);
    }
}

pub(super) fn in_progress(app: &AppHandle) -> bool {
    app.state::<AppQuit>()
        .0
        .lock()
        .map(|state| state.request.is_some())
        .unwrap_or(true)
}

pub(super) fn guard_exit(app: &AppHandle, code: Option<i32>, api: &tauri::ExitRequestApi) {
    let quit = app.state::<AppQuit>();
    let Ok(mut state) = quit.0.lock() else {
        api.prevent_exit();
        return;
    };
    if state.exit_approved {
        return;
    }
    let mut windows: Vec<_> = app.webview_windows().into_values().collect();
    if windows.is_empty() {
        // On macOS the app remains available for Dock reopen after its last
        // window closes. An explicit quit still exits immediately.
        if cfg!(target_os = "macos") && code.is_none() {
            api.prevent_exit();
        }
        return;
    }
    api.prevent_exit();
    if windows
        .iter()
        .any(|window| !state.ready.contains(window.label()))
    {
        eprintln!("Quit deferred until all Galley Pad windows finish starting up");
        return;
    }
    windows.sort_by_key(|window| {
        (
            !window.is_focused().unwrap_or(false),
            window.label().to_owned(),
        )
    });
    let step = state.begin(
        windows
            .iter()
            .map(|window| window.label().to_owned())
            .collect(),
        code.unwrap_or_default(),
    );
    drop(state);
    advance(app, step);
}

#[tauri::command]
pub(super) fn register_app_quit_window(
    window: WebviewWindow,
    quit: State<'_, AppQuit>,
) -> Result<(), String> {
    quit.0
        .lock()
        .map_err(|_| "Quit request is unavailable")?
        .ready
        .insert(window.label().to_owned());
    #[cfg(target_os = "linux")]
    if window.label() == super::MAIN_WINDOW_LABEL {
        super::signal_linux_display_ready_once();
    }
    Ok(())
}

#[tauri::command]
pub(super) fn answer_app_quit_check(
    app: AppHandle,
    window: WebviewWindow,
    quit: State<'_, AppQuit>,
    request_id: u64,
    approved: bool,
) -> Result<(), String> {
    let step = quit
        .0
        .lock()
        .map_err(|_| "Quit request is unavailable")?
        .checked(request_id, window.label(), approved);
    advance(&app, step);
    Ok(())
}

#[tauri::command]
pub(super) fn finish_app_quit_clear(
    app: AppHandle,
    window: WebviewWindow,
    quit: State<'_, AppQuit>,
    request_id: u64,
) -> Result<(), String> {
    let step = quit
        .0
        .lock()
        .map_err(|_| "Quit request is unavailable")?
        .cleared(request_id, window.label());
    advance(&app, step);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_quit_keeps_all_window_recovery_snapshots() {
        let mut state = QuitState::default();
        let windows = vec!["main".into(), "secondary".into()];
        assert!(matches!(state.begin(windows, 0), Step::Check(label, 1) if label == "main"));
        assert!(
            matches!(state.checked(1, "main", true), Step::Check(label, 1) if label == "secondary")
        );
        assert!(matches!(
            state.checked(1, "secondary", false),
            Step::Cancel(1)
        ));
        assert!(matches!(state.cleared(1, "main"), Step::Wait));
        assert!(!state.exit_approved);
    }

    #[test]
    fn quit_waits_for_all_windows_before_cleanup_and_exit() {
        let mut state = QuitState::default();
        state.begin(vec!["main".into(), "secondary".into()], 0);
        assert!(matches!(state.checked(1, "main", true), Step::Check(..)));
        assert!(
            matches!(state.checked(1, "secondary", true), Step::Clear(labels, 1) if labels.len() == 2)
        );
        assert!(matches!(state.cleared(1, "main"), Step::Wait));
        assert!(matches!(state.cleared(1, "secondary"), Step::Exit(0)));
        assert!(state.exit_approved);
    }
}

#[cfg(test)]
mod deadline_tests {
    use super::*;

    #[test]
    fn an_expired_check_cancels_only_the_current_window() {
        let mut state = QuitState::default();
        state.begin(vec!["main".into(), "secondary".into()], 0);
        state.checked(1, "main", true);
        assert!(matches!(state.expire_check(1, "main"), Step::Wait));
        assert!(matches!(
            state.expire_check(1, "secondary"),
            Step::Cancel(1)
        ));
        assert!(matches!(state.checked(1, "secondary", true), Step::Wait));
        assert!(matches!(
            state.begin(vec!["main".into()], 0),
            Step::Check(_, 2)
        ));
    }

    #[test]
    fn cleanup_timeout_exits_only_after_every_window_approved() {
        let mut state = QuitState::default();
        state.begin(vec!["main".into()], 0);
        assert!(matches!(state.expire_clear(1), Step::Wait));
        state.checked(1, "main", true);
        assert!(matches!(state.expire_clear(1), Step::Exit(0)));
    }
}
