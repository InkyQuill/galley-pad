use galley_pad_lib::{PersistedAppSettings, RawPersistedAppSettings};
use serde_json::json;

#[test]
fn word_wrap_persistence_preserves_raw_values_and_writes_booleans() {
    let raw = serde_json::from_str::<RawPersistedAppSettings>(r#"{ "wordWrap": "broken" }"#)
        .expect("deserialize raw persisted settings");

    assert_eq!(raw.word_wrap, Some(json!("broken")));

    let persisted = PersistedAppSettings {
        appearance_theme: None,
        theme_settings: None,
        editor_font_family: None,
        editor_font_size: None,
        open_mode: None,
        word_wrap: Some(false),
    };

    assert_eq!(
        serde_json::to_value(&persisted)
            .expect("serialize persisted settings")
            .get("wordWrap"),
        Some(&json!(false))
    );
    assert!(
        serde_json::from_str::<PersistedAppSettings>(r#"{ "wordWrap": "broken" }"#).is_err(),
        "write settings must reject non-boolean word wrap values"
    );
}
