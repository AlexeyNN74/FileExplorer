use std::path::PathBuf;
use std::sync::{LazyLock, OnceLock};

static APP_PATHS: OnceLock<(PathBuf, PathBuf)> = OnceLock::new();

/// Must run from Tauri setup, before constructing any settings or metadata.
pub fn initialize_paths(config: PathBuf, logs: PathBuf) -> Result<(), &'static str> {
    APP_PATHS.set((config, logs)).map_err(|_| "Application paths already initialized")
}

fn app_paths() -> &'static (PathBuf, PathBuf) {
    #[cfg(test)]
    return APP_PATHS.get_or_init(|| {
        static ROOT: LazyLock<tempfile::TempDir> = LazyLock::new(|| tempfile::tempdir().unwrap());
        (ROOT.path().join("config"), ROOT.path().join("logs"))
    });
    #[cfg(not(test))]
    APP_PATHS.get().expect("Initialize application paths before state")
}

pub static VERSION: &str = "0.2.3";

pub static CONFIG_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    app_paths().0.clone()
});

pub static META_DATA_CONFIG_ABS_PATH: LazyLock<PathBuf> =
    LazyLock::new(|| CONFIG_PATH.join(META_DATA_CONFIG_FILE_NAME));


pub static LOG_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    app_paths().1.clone()
});


pub static META_DATA_CONFIG_FILE_NAME: &str = "meta_data.json";

pub static LOG_FILE_NAME: &str = "app.log";
pub static ERROR_LOG_FILE_NAME: &str = "error.log";

pub static TEST_DATA_PATH: &str = "./test-data-for-fuzzy-search";

pub static LOG_FILE_ABS_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    LOG_PATH.join(LOG_FILE_NAME)
});

pub static ERROR_LOG_FILE_ABS_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    LOG_PATH.join(ERROR_LOG_FILE_NAME)
});

pub const MAX_NUMBER_OF_LOG_FILES: usize = 3;

pub static SETTINGS_CONFIG_ABS_PATH: LazyLock<PathBuf> =
    LazyLock::new(|| CONFIG_PATH.join(SETTINGS_CONFIG_FILE_NAME));
pub static SETTINGS_CONFIG_FILE_NAME: &str = "settings.json";

pub static TEMPLATES_ABS_PATH_FOLDER: LazyLock<PathBuf> =
    LazyLock::new(|| CONFIG_PATH.join(TEMPLATES_FOLDER));
pub static TEMPLATES_FOLDER: &str = "templates";
