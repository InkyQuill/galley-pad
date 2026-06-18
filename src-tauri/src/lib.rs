fn app_title() -> &'static str {
    "Galley Pad"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
}
