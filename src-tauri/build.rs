fn main() {
    const WINDOWS_TEST_MANIFEST: &str = "GALLEY_PAD_WINDOWS_TEST_MANIFEST";
    println!("cargo:rerun-if-env-changed={WINDOWS_TEST_MANIFEST}");

    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows")
    ) && matches!(std::env::var("CARGO_CFG_TARGET_ENV").as_deref(), Ok("msvc"))
        && matches!(std::env::var(WINDOWS_TEST_MANIFEST).as_deref(), Ok("1"))
    {
        // Tauri's application resources are only linked into binaries, not the
        // unit and integration test executables. TaskDialogIndirect requires v6.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
        )
        .expect("build Windows test resources");
    } else {
        tauri_build::build();
    }
}
