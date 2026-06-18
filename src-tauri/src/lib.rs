fn app_title() -> &'static str {
    "Galley Pad"
}

#[cfg(target_os = "linux")]
fn should_disable_dmabuf_renderer(
    wayland_display_present: bool,
    dmabuf_renderer_configured: bool,
) -> bool {
    wayland_display_present && !dmabuf_renderer_configured
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_wayland_renderer() {
    if should_disable_dmabuf_renderer(
        std::env::var_os("WAYLAND_DISPLAY").is_some(),
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some(),
    ) {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_wayland_renderer();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {}: {error}", app_title()));
}

#[cfg(test)]
mod tests {
    use super::app_title;

    #[test]
    fn app_title_matches_product_name() {
        assert_eq!(app_title(), "Galley Pad");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_wayland_disables_dmabuf_renderer_when_unconfigured() {
        assert!(super::should_disable_dmabuf_renderer(true, false));
        assert!(!super::should_disable_dmabuf_renderer(true, true));
        assert!(!super::should_disable_dmabuf_renderer(false, false));
    }
}
