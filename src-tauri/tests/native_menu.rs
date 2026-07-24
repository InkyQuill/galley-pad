use galley_pad_lib::set_word_wrap_menu_checked_for_app;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, Submenu};

const MENU_VIEW_ID: &str = "app-menu-view";
const MENU_WORD_WRAP_ID: &str = "app-menu-word-wrap";

#[test]
fn word_wrap_menu_update_changes_the_checked_state() {
    let app = tauri::test::mock_app();
    let word_wrap = CheckMenuItem::with_id(
        &app,
        MENU_WORD_WRAP_ID,
        "Word Wrap",
        true,
        true,
        None::<&str>,
    )
    .expect("create Word Wrap menu item");
    let view = Submenu::with_id_and_items(&app, MENU_VIEW_ID, "View", true, &[&word_wrap])
        .expect("create View menu");
    let menu = Menu::with_items(&app, &[&view]).expect("create app menu");
    app.set_menu(menu).expect("set app menu");

    set_word_wrap_menu_checked_for_app(&app.handle(), false).expect("update Word Wrap state");

    assert!(!word_wrap.is_checked().expect("read Word Wrap state"));
}

#[test]
fn word_wrap_menu_update_reports_an_unavailable_app_menu() {
    let app = tauri::test::mock_app();

    assert_eq!(
        set_word_wrap_menu_checked_for_app(&app.handle(), false),
        Err("Application menu is unavailable".to_string())
    );
}

#[test]
fn word_wrap_menu_update_reports_an_unexpected_view_menu_type() {
    let app = tauri::test::mock_app();
    let view = MenuItem::with_id(&app, MENU_VIEW_ID, "View", true, None::<&str>)
        .expect("create plain View menu item");
    let menu = Menu::with_items(&app, &[&view]).expect("create app menu");
    app.set_menu(menu).expect("set app menu");

    assert_eq!(
        set_word_wrap_menu_checked_for_app(&app.handle(), false),
        Err("View menu has an unexpected type".to_string())
    );
}

#[test]
fn word_wrap_menu_update_reports_a_missing_word_wrap_item() {
    let app = tauri::test::mock_app();
    let view = Submenu::with_id_and_items(&app, MENU_VIEW_ID, "View", true, &[])
        .expect("create View menu");
    let menu = Menu::with_items(&app, &[&view]).expect("create app menu");
    app.set_menu(menu).expect("set app menu");

    assert_eq!(
        set_word_wrap_menu_checked_for_app(&app.handle(), false),
        Err("Word Wrap menu item is unavailable".to_string())
    );
}
