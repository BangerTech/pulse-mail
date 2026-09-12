use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
#[cfg(windows)]
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, WebviewWindow};
use url::Url;

const WINDOW_LABEL: &str = "main";

#[derive(Default, Serialize, Deserialize)]
struct AppConfig {
  url: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("config.json"))
}

fn read_config(app: &AppHandle) -> AppConfig {
  let Ok(path) = config_path(app) else {
    return AppConfig::default();
  };
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn write_config(app: &AppHandle, url: &str) -> Result<(), String> {
  let path = config_path(app)?;
  let raw = serde_json::to_string_pretty(&AppConfig {
    url: url.to_string(),
  })
  .map_err(|e| e.to_string())?;
  fs::write(path, raw).map_err(|e| e.to_string())
}

fn parse_mail_url(raw: &str) -> Result<Url, String> {
  let parsed = Url::parse(raw.trim()).map_err(|e| e.to_string())?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return Err("Nur http oder https".into());
  }
  if parsed.host_str().is_none() {
    return Err("Host fehlt".into());
  }
  Ok(parsed)
}

fn cli_url() -> Option<String> {
  if let Ok(from_env) = std::env::var("PULSE_MAIL_URL") {
    if !from_env.trim().is_empty() {
      return Some(from_env);
    }
  }
  let mut args = std::env::args().skip(1);
  while let Some(arg) = args.next() {
    if arg == "--setup" {
      return None;
    }
    if arg == "--url" {
      return args.next();
    }
    if let Some(url) = arg.strip_prefix("--url=") {
      return Some(url.to_string());
    }
  }
  None
}

fn force_setup() -> bool {
  std::env::args().any(|arg| arg == "--setup")
}

fn setup_page_url() -> Url {
  if cfg!(windows) {
    Url::parse("https://tauri.localhost/index.html").expect("setup url")
  } else {
    Url::parse("http://tauri.localhost/index.html").expect("setup url")
  }
}

fn remote_start_url(app: &AppHandle) -> Option<Url> {
  if force_setup() {
    return None;
  }
  if let Some(raw) = cli_url() {
    if let Ok(url) = parse_mail_url(&raw) {
      let _ = write_config(app, url.as_str());
      return Some(url);
    }
  }
  parse_mail_url(&read_config(app).url).ok()
}

#[cfg_attr(not(windows), allow(dead_code))]
fn badge_png(count: u32) -> Option<&'static [u8]> {
  Some(match count {
    0 => return None,
    1 => include_bytes!("../icons/badge-1.png").as_slice(),
    2 => include_bytes!("../icons/badge-2.png").as_slice(),
    3 => include_bytes!("../icons/badge-3.png").as_slice(),
    4 => include_bytes!("../icons/badge-4.png").as_slice(),
    5 => include_bytes!("../icons/badge-5.png").as_slice(),
    6 => include_bytes!("../icons/badge-6.png").as_slice(),
    7 => include_bytes!("../icons/badge-7.png").as_slice(),
    8 => include_bytes!("../icons/badge-8.png").as_slice(),
    9 => include_bytes!("../icons/badge-9.png").as_slice(),
    _ => include_bytes!("../icons/badge-more.png").as_slice(),
  })
}

fn set_unread_overlay(window: &WebviewWindow, count: u32) {
  #[cfg(windows)]
  {
    let icon = badge_png(count).and_then(|bytes| Image::from_bytes(bytes).ok());
    let _ = window.set_overlay_icon(icon);
  }
  #[cfg(not(windows))]
  {
    let _ = (window, count);
  }
}

fn unread_from_title(title: &str) -> Option<u32> {
  let rest = title.strip_prefix('(')?;
  let (num, _) = rest.split_once(')')?;
  let digits = num.trim_end_matches('+');
  digits.parse().ok()
}

fn watch_title_badge(app: AppHandle) {
  std::thread::spawn(move || {
    let mut last = u32::MAX;
    loop {
      std::thread::sleep(Duration::from_secs(2));
      let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        continue;
      };
      let Ok(title) = window.title() else {
        continue;
      };
      let count = unread_from_title(&title).unwrap_or(0);
      if count != last {
        last = count;
        set_unread_overlay(&window, count);
      }
    }
  });
}

#[tauri::command]
fn get_server_url(app: AppHandle) -> String {
  if let Some(raw) = cli_url() {
    if parse_mail_url(&raw).is_ok() {
      return raw;
    }
  }
  read_config(&app).url
}

#[tauri::command]
fn save_server_url(app: AppHandle, window: WebviewWindow, url: String) -> Result<(), String> {
  let parsed = parse_mail_url(&url)?;
  write_config(&app, parsed.as_str())?;
  window.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_dock_badge(window: WebviewWindow, count: u32) -> Result<(), String> {
  set_unread_overlay(&window, count);
  Ok(())
}

#[tauri::command]
fn clear_dock_badge(window: WebviewWindow) -> Result<(), String> {
  set_unread_overlay(&window, 0);
  Ok(())
}

fn navigate_setup(window: &WebviewWindow) {
  let _ = window.navigate(setup_page_url());
}

fn attach_menu(app: &AppHandle) -> tauri::Result<()> {
  let server = MenuItemBuilder::with_id("server", "Server ändern…").build(app)?;
  let reload = MenuItemBuilder::with_id("reload", "Neu laden").build(app)?;
  let file = SubmenuBuilder::new(app, "Datei")
    .item(&server)
    .item(&reload)
    .separator()
    .quit()
    .build()?;
  let menu = MenuBuilder::new(app).item(&file).build()?;
  app.set_menu(menu)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      get_server_url,
      save_server_url,
      set_dock_badge,
      clear_dock_badge
    ])
    .setup(|app| {
      attach_menu(app.handle())?;
      if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if let Some(url) = remote_start_url(app.handle()) {
          let _ = window.navigate(url);
        }
      }
      watch_title_badge(app.handle().clone());
      Ok(())
    })
    .on_menu_event(|app, event| match event.id().as_ref() {
      "server" => {
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
          navigate_setup(&window);
        }
      }
      "reload" => {
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
          let _ = window.eval("location.reload()");
        }
      }
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("Pulse Mail Desktop konnte nicht starten");
}
