#![cfg(target_os = "linux")]

use galley_pad_lib::configure_linux_display_backend;
use std::process::Command;

#[test]
fn x11_startup_configures_webkit_without_overwriting_explicit_settings() {
    const CHILD: &str = "GALLEY_PAD_TEST_DISPLAY_CONFIG_CHILD";
    if std::env::var_os(CHILD).is_some() {
        let expected =
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").unwrap_or_else(|_| "1".to_string());
        configure_linux_display_backend();
        assert_eq!(
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER"),
            Ok(expected)
        );
        // X11 must not enable the Wayland-only compositing workaround.
        assert!(std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none());
        return;
    }

    // Isolate environment mutation from the parent and all other test threads.
    for override_value in [None, Some("0"), Some("1")] {
        let mut child = Command::new(std::env::current_exe().expect("test executable"));
        child
            .args([
                "--exact",
                "x11_startup_configures_webkit_without_overwriting_explicit_settings",
                "--nocapture",
            ])
            .env(CHILD, "1")
            .env("GDK_BACKEND", "x11")
            .env("WAYLAND_DISPLAY", "wayland-0")
            .env_remove("WEBKIT_DISABLE_DMABUF_RENDERER")
            .env_remove("WEBKIT_DISABLE_COMPOSITING_MODE");
        if let Some(value) = override_value {
            child.env("WEBKIT_DISABLE_DMABUF_RENDERER", value);
        }
        let output = child.output().expect("run isolated startup configuration");
        assert!(
            output.status.success(),
            "override {override_value:?}: {}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
    }
}
