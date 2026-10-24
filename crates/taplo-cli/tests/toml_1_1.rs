//! `taplo get` and `taplo lint` on TOML 1.1 documents.

use serde_json::{json, Value};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Output, Stdio},
};

const FEATURES: &str = include_str!("../../../test-data/toml-1.1/features.toml");

fn features_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test-data/toml-1.1/features.toml")
}

fn features_json() -> Value {
    json!({
        "esc": "\u{1b}[1mbold\u{1b}[0m",
        "hex": "S\u{f8}rmirb\u{e6}ren A",
        "multi-line-hex": "Hi\u{1b}",
        "time": "13:37:00",
        "local-date-time": "1979-05-27T07:32:00",
        "offset-date-time": "1979-05-27T07:32:00Z",
        "negative-offset": "1979-05-27T07:32:00-07:00",
        "trailing-comma": { "a": 1 },
        "server": {
            "host": "localhost",
            "ports": [8080, 8443],
            "tls": { "cert": "cert.pem", "key": "key.pem" },
            "hours": { "open": "08:00:00", "close": "17:30:00" }
        },
        "table": {
            "inline": { "a": 1, "b": { "c": 2 } },
            "after": true
        }
    })
}

fn taplo(args: &[&str], stdin: Option<&str>) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_taplo"))
        .args(args)
        .env_remove("TAPLO_CONFIG")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let mut child_stdin = child.stdin.take().unwrap();
    child_stdin
        .write_all(stdin.unwrap_or_default().as_bytes())
        .unwrap();
    drop(child_stdin);

    child.wait_with_output().unwrap()
}

fn stdout_of(args: &[&str], stdin: Option<&str>) -> String {
    let out = taplo(args, stdin);
    assert!(
        out.status.success(),
        "taplo {args:?} failed:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}

fn get_json(args: &[&str], stdin: Option<&str>) -> Value {
    serde_json::from_str(&stdout_of(&[&["get", "-o", "json"], args].concat(), stdin)).unwrap()
}

/// A scratch directory for files used by a single test.
fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("taplo-cli-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn get_json_output() {
    let file = features_path();
    assert_eq!(
        get_json(&["-f", file.to_str().unwrap()], None),
        features_json()
    );
    assert_eq!(get_json(&[], Some(FEATURES)), features_json());

    assert_eq!(
        get_json(&["-f", file.to_str().unwrap(), "server.tls"], None),
        features_json()["server"]["tls"]
    );
}

#[test]
fn get_value_output() {
    let file = features_path();
    let file = file.to_str().unwrap();

    for (pattern, expected) in [
        ("esc", "\u{1b}[1mbold\u{1b}[0m"),
        ("hex", "S\u{f8}rmirb\u{e6}ren A"),
        ("multi-line-hex", "Hi\u{1b}"),
        ("time", "13:37:00"),
        ("local-date-time", "1979-05-27T07:32:00"),
        ("offset-date-time", "1979-05-27T07:32:00Z"),
        ("negative-offset", "1979-05-27T07:32:00-07:00"),
        ("trailing-comma.a", "1"),
        ("server.host", "localhost"),
        ("server.ports", "8080\n8443"),
        ("server.tls.cert", "cert.pem"),
        ("server.hours.close", "17:30:00"),
        ("table.inline.b.c", "2"),
    ] {
        assert_eq!(
            stdout_of(&["get", "-o", "value", "-f", file, pattern], None),
            format!("{expected}\n"),
            "{pattern}"
        );
    }
}

#[test]
fn get_toml_output() {
    let file = features_path();
    let file = file.to_str().unwrap();

    let toml = stdout_of(&["get", "-o", "toml", "-f", file], None);
    assert_eq!(get_json(&[], Some(&toml)), features_json(), "{toml}");

    let toml = stdout_of(&["get", "-o", "toml", "-f", file, "table"], None);
    assert_eq!(
        get_json(&[], Some(&toml)),
        features_json()["table"],
        "{toml}"
    );

    for pattern in ["server", "server.tls", "table.inline", "time", "esc"] {
        let toml = stdout_of(&["get", "-o", "toml", "-f", file, pattern], None);
        let value = get_json(&[], Some(&format!("value = {toml}")));
        assert_eq!(
            value["value"],
            features_json()
                .pointer(&format!("/{}", pattern.replace('.', "/")))
                .unwrap()
                .clone(),
            "{pattern}: {toml}"
        );
    }
}

#[test]
fn lint_without_schema() {
    let file = features_path();
    let out = taplo(
        &[
            "lint",
            "--no-auto-config",
            "--no-schema",
            file.to_str().unwrap(),
        ],
        None,
    );
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    let out = taplo(
        &["lint", "--no-auto-config", "--no-schema", "-"],
        Some(FEATURES),
    );
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn lint_with_schema() {
    let dir = scratch_dir("lint-with-schema");
    let schema_path = dir.join("schema.json");

    std::fs::write(
        &schema_path,
        json!({
            "type": "object",
            "properties": {
                "esc": { "type": "string", "const": "\u{1b}[1mbold\u{1b}[0m" },
                "hex": { "type": "string", "pattern": "^S\u{f8}rmirb\u{e6}ren A$" },
                "local-date-time": { "type": "string", "pattern": "^1979-05-27T07:32:00$" },
                "offset-date-time": { "type": "string", "format": "date-time" },
                "negative-offset": { "type": "string", "format": "date-time" },
                "server": {
                    "type": "object",
                    "properties": {
                        "host": { "type": "string" },
                        "ports": { "type": "array", "items": { "type": "integer" } },
                        "tls": {
                            "type": "object",
                            "properties": {
                                "cert": { "type": "string" },
                                "key": { "type": "string" }
                            },
                            "additionalProperties": false
                        }
                    }
                }
            }
        })
        .to_string(),
    )
    .unwrap();

    let schema_url = format!("file://{}", schema_path.display());
    let lint = |src: &str| {
        let doc_path = dir.join("doc.toml");
        std::fs::write(&doc_path, src).unwrap();
        taplo(
            &[
                "lint",
                "--no-auto-config",
                "--colors",
                "never",
                "--schema",
                &schema_url,
                doc_path.to_str().unwrap(),
            ],
            None,
        )
    };

    let out = lint(FEATURES);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    // Schema errors inside a multi-line inline table point to the right line.
    let invalid = FEATURES.replace(r#"cert = "cert.pem","#, "cert = 1,\n    password = \"x\",");
    let out = lint(&invalid);
    assert!(!out.status.success());

    let stderr = String::from_utf8_lossy(&out.stderr);
    let line_of = |needle: &str| invalid.lines().position(|l| l.contains(needle)).unwrap() + 1;
    assert!(
        stderr.contains(&format!("doc.toml:{}:12", line_of("cert = 1"))),
        "{stderr}"
    );
    assert!(stderr.contains("'password' was unexpected"), "{stderr}");
}
