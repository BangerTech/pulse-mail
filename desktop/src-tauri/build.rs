fn main() {
  // Register app commands in the ACL so capabilities can allow them.
  // Without this list, newer Tauri builds deny custom invokes (e.g. save_server_url).
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&[
        "get_server_url",
        "save_server_url",
        "set_dock_badge",
        "clear_dock_badge",
        "save_attachment",
      ]),
    ),
  )
  .expect("failed to run tauri-build");
}
