use std::{env, fs, process::Command};

/// Builds the sidecars that tauri.conf.json's `externalBin` ships inside
/// Margin.app: the Go CLI (../cli) as `margin-cli` and the MCP server (../mcp)
/// as `margin-mcp`. tauri_build requires both files to exist, so this runs
/// first. Needs Go and Bun on PATH, and ../mcp's node_modules installed.
fn main() {
    println!("cargo:rerun-if-changed=../cli");
    println!("cargo:rerun-if-changed=../mcp/src");
    let target = env::var("TARGET").expect("cargo sets TARGET");
    let (goarch, bun_target) = match target.split('-').next() {
        Some("aarch64") => ("arm64", "bun-darwin-arm64"),
        Some("x86_64") => ("amd64", "bun-darwin-x64"),
        other => panic!("no sidecar build for target {other:?}"),
    };
    fs::create_dir_all("binaries").expect("create src-tauri/binaries");
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_default();

    build_sidecar("margin-cli", &target, "go", "../cli", |out| {
        vec![
            "build".into(),
            "-trimpath".into(),
            "-ldflags".into(),
            format!("-X github.com/nicholasgasior/margin/cli/cmd.Version={version}"),
            "-o".into(),
            format!("../src-tauri/{out}"),
            ".".into(),
        ]
    }, &[("GOOS", "darwin"), ("GOARCH", goarch), ("CGO_ENABLED", "0")]);

    build_sidecar("margin-mcp", &target, "bun", "../mcp", |out| {
        vec![
            "build".into(),
            "--compile".into(),
            "--minify".into(),
            format!("--target={bun_target}"),
            "src/index.ts".into(),
            "--outfile".into(),
            format!("../src-tauri/{out}"),
        ]
    }, &[]);

    tauri_build::build()
}

fn build_sidecar(
    name: &str,
    target: &str,
    tool: &str,
    dir: &str,
    args: impl Fn(&str) -> Vec<String>,
    envs: &[(&str, &str)],
) {
    let out = format!("binaries/{name}-{target}");
    let tmp = format!("{out}.tmp");
    let status = Command::new(tool)
        .current_dir(dir)
        .envs(envs.iter().copied())
        .args(args(&tmp))
        .status()
        .unwrap_or_else(|e| panic!("run `{tool}` to build the {name} sidecar (is {tool} installed?): {e}"));
    assert!(status.success(), "{tool} build for the {name} sidecar failed");

    // tauri_build watches sidecar files. Replace one only when its bytes
    // differ, or every build would see it as changed and rebuild again.
    if fs::read(&out).ok() == fs::read(&tmp).ok() {
        fs::remove_file(&tmp).unwrap_or_else(|e| panic!("remove unchanged {name} build: {e}"));
    } else {
        fs::rename(&tmp, &out).unwrap_or_else(|e| panic!("install {name} sidecar: {e}"));
    }
}
