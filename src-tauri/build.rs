use std::{env, fs, process::Command};

/// Builds the Go CLI in ../cli as the `margin-cli` sidecar that tauri.conf.json's
/// `externalBin` ships inside Margin.app. tauri_build requires the file to exist,
/// so this runs first. Needs Go on PATH.
fn build_cli_sidecar() {
    println!("cargo:rerun-if-changed=../cli");
    let target = env::var("TARGET").expect("cargo sets TARGET");
    let goarch = match target.split('-').next() {
        Some("aarch64") => "arm64",
        Some("x86_64") => "amd64",
        other => panic!("no margin-cli sidecar build for target {other:?}"),
    };
    fs::create_dir_all("binaries").expect("create src-tauri/binaries");
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_default();
    let out = format!("binaries/margin-cli-{target}");
    let tmp = format!("{out}.tmp");
    let status = Command::new("go")
        .current_dir("../cli")
        .env("GOOS", "darwin")
        .env("GOARCH", goarch)
        .env("CGO_ENABLED", "0")
        .args([
            "build",
            "-trimpath",
            "-ldflags",
            &format!("-X github.com/nicholasgasior/margin/cli/cmd.Version={version}"),
            "-o",
            &format!("../src-tauri/{tmp}"),
            ".",
        ])
        .status()
        .expect("run `go build` for the margin-cli sidecar (is Go installed?)");
    assert!(status.success(), "go build for the margin-cli sidecar failed");

    // tauri_build watches the sidecar file. Replace it only when the bytes
    // differ, or every build would see it as changed and rebuild again.
    if fs::read(&out).ok() == fs::read(&tmp).ok() {
        fs::remove_file(&tmp).expect("remove unchanged margin-cli build");
    } else {
        fs::rename(&tmp, &out).expect("install margin-cli sidecar");
    }
}

fn main() {
    build_cli_sidecar();
    tauri_build::build()
}
