//! Startup persistence and opt-in, local-only frontend crash reports.
use crate::{constants, state::SettingsState};
use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};

pub fn migrate_legacy_settings_from_env() -> io::Result<()> {
    fs::create_dir_all(&*constants::CONFIG_PATH)?;
    fs::create_dir_all(&*constants::LOG_PATH)?;
    if let Some(source) = std::env::var_os("EXPLR_LEGACY_CONFIG_DIR") {
        let source = std::path::PathBuf::from(source);
        if !source.is_absolute() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "EXPLR_LEGACY_CONFIG_DIR must be absolute",
            ));
        }
        migrate_legacy_settings(&source, &constants::SETTINGS_CONFIG_ABS_PATH)?;
    }
    Ok(())
}

/// Explicit import only. Preserve the source and never replace destination settings.
fn migrate_legacy_settings(source: &Path, destination: &Path) -> io::Result<()> {
    if destination.exists() {
        return Ok(());
    }
    let mut settings = SettingsState::read_settings_from_file(&source.join("settings.json"))?;
    settings.abs_file_path_buf = destination.to_path_buf();
    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "No config directory"))?;
    fs::create_dir_all(parent)?;
    let mut pending = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(pending.as_file_mut(), &settings)?;
    pending.as_file().sync_all()?;
    match pending.persist_noclobber(destination) {
        Ok(_) => Ok(()),
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.error),
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrontendErrorReport {
    message: String,
    stack: String,
    component_stack: String,
}

#[tauri::command]
pub fn report_frontend_error(report: FrontendErrorReport) -> Result<Option<String>, String> {
    let enabled = std::env::var("EXPLR_DIAGNOSTICS").as_deref() == Ok("1");
    save_frontend_error(enabled, &constants::LOG_PATH, &report)
        .map(|path| path.map(|path| path.to_string_lossy().into_owned()))
        .map_err(|_| "Could not save the local diagnostic report".to_string())
}

fn save_frontend_error(
    enabled: bool,
    directory: &Path,
    report: &FrontendErrorReport,
) -> io::Result<Option<std::path::PathBuf>> {
    // Do not create a directory or serialize sensitive details when not opted in.
    if !enabled {
        return Ok(None);
    }
    if [&report.message, &report.stack, &report.component_stack]
        .iter()
        .any(|field| field.len() > 16_384)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Diagnostic field too large",
        ));
    }
    let bytes = serde_json::to_vec_pretty(report)?;
    if bytes.len() > 128 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Diagnostic report too large",
        ));
    }
    fs::create_dir_all(directory)?;
    // NamedTempFile is private (0600 on Unix); atomic replacement avoids partial
    // reports and following a pre-existing destination symlink. Keep only one report.
    let mut pending = tempfile::NamedTempFile::new_in(directory)?;
    use std::io::Write;
    pending.write_all(&bytes)?;
    pending.as_file().sync_all()?;
    let destination = directory.join("frontend-error.json");
    pending.persist(&destination).map_err(|error| error.error)?;
    Ok(Some(destination))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Settings;

    #[test]
    fn legacy_import_preserves_source_rebases_path_and_never_overwrites() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("legacy");
        fs::create_dir(&source).unwrap();
        let mut settings = Settings::default();
        settings.darkmode = true;
        settings.abs_file_path_buf = source.join("settings.json");
        let original = serde_json::to_vec(&settings).unwrap();
        fs::write(source.join("settings.json"), &original).unwrap();
        let destination = root.path().join("new/settings.json");
        migrate_legacy_settings(&source, &destination).unwrap();
        let imported: Settings = serde_json::from_slice(&fs::read(&destination).unwrap()).unwrap();
        assert!(imported.darkmode);
        assert_eq!(imported.abs_file_path_buf, destination);
        assert_eq!(fs::read(source.join("settings.json")).unwrap(), original);
        fs::write(&destination, "existing user data").unwrap();
        migrate_legacy_settings(&source, &destination).unwrap();
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "existing user data"
        );
    }

    #[test]
    fn invalid_legacy_settings_leave_destination_absent() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("settings.json"), "not json").unwrap();
        let destination = root.path().join("new/settings.json");
        assert!(migrate_legacy_settings(root.path(), &destination).is_err());
        assert!(!destination.exists());
    }

    fn report() -> FrontendErrorReport {
        FrontendErrorReport {
            message: "Error: <private>".into(),
            stack: "at render (app.js:1)".into(),
            component_stack: "\n at MainLayout".into(),
        }
    }

    #[test]
    fn diagnostics_are_off_by_default_and_round_trip_when_enabled() {
        let root = tempfile::tempdir().unwrap();
        let logs = root.path().join("logs");
        assert!(save_frontend_error(false, &logs, &report())
            .unwrap()
            .is_none());
        assert!(!logs.exists());
        let path = save_frontend_error(true, &logs, &report())
            .unwrap()
            .unwrap();
        let saved: FrontendErrorReport = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved.message, report().message);
        assert_eq!(saved.stack, report().stack);
        assert_eq!(saved.component_stack, report().component_stack);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        save_frontend_error(true, &logs, &report()).unwrap();
        assert_eq!(fs::read_dir(logs).unwrap().count(), 1);
    }

    #[test]
    fn oversized_diagnostics_are_rejected_without_writing() {
        let root = tempfile::tempdir().unwrap();
        let logs = root.path().join("logs");
        let mut report = report();
        report.stack = "x".repeat(16_385);
        assert!(save_frontend_error(true, &logs, &report).is_err());
        assert!(!logs.exists());
    }

    #[test]
    fn loading_copied_settings_does_not_reuse_serialized_write_path() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("settings.json");
        let settings = Settings::default();
        fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();
        assert_eq!(
            SettingsState::read_settings_from_file(&path)
                .unwrap()
                .abs_file_path_buf,
            path
        );
    }
}
