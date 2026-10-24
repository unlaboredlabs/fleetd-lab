//! `taplo get` and `taplo lint` with TOML 1.1 documents.

use serde_json::{json, Value};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Output, Stdio},
};

const TOML_1_1_DOCUMENT: &str = r#"# Ünïcödé comment — 日本語 🎉
name = "esc\e[0m \x41\xe9"
lit = 'ñ — literal'
time = 07:32
local = 1979-05-27 07:32
offset = 1979-05-27T07:32Z
date = 1979-05-27
1 = "numeric key"

point = {
    x = 1, # the x coordinate
    # a comment line — ünïcödé
    y = 2,
    nested = { a = [1, 2,], b = {
        c = 07:32:01,
    } },
}

[table]
inline = { a = 1, b = "two", }
"#;

fn toml_1_1_json() -> Value {
    json!({
        "name": "esc\u{1b}[0m A\u{e9}",
        "lit": "ñ — literal",
        "time": "07:32:00",
        "local": "1979-05-27T07:32:00",
        "offset": "1979-05-27T07:32:00Z",
        "date": "1979-05-27",
        "1": "numeric key",
        "point": {
            "x": 1,
            "y": 2,
            "nested": { "a": [1, 2], "b": { "c": "07:32:01" } },
        },
        "table": { "inline": { "a": 1, "b": "two" } },
    })
}

fn toml_1_1_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "lit", "time", "local", "offset", "date", "1", "point", "table"],
        "properties": {
            "name": { "type": "string", "const": "esc\u{1b}[0m A\u{e9}" },
            "lit": { "type": "string" },
            "time": { "type": "string", "const": "07:32:00" },
            "local": { "type": "string", "const": "1979-05-27T07:32:00" },
            "offset": { "type": "string", "format": "date-time" },
            "date": { "type": "string", "format": "date" },
            "1": { "type": "string" },
            "point": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "x": { "type": "integer" },
                    "y": { "type": "integer" },
                    "nested": { "type": "object" },
                },
            },
            "table": { "type": "object" },
        },
    })
}

fn taplo(args: &[&str], stdin: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_taplo"))
        .args(args)
        .current_dir(env!("CARGO_TARGET_TMPDIR"))
        .env("RUST_LOG", "error")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();

    child.wait_with_output().unwrap()
}

fn success(args: &[&str], stdin: &str) -> String {
    let output = taplo(args, stdin);
    assert!(
        output.status.success(),
        "taplo {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

fn schema_url(name: &str, schema: &Value) -> String {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    std::fs::write(&path, schema.to_string()).unwrap();
    url::Url::from_file_path(path).unwrap().to_string()
}

#[test]
fn get_json() {
    let json = success(&["get", "-o", "json"], TOML_1_1_DOCUMENT);
    assert_eq!(
        serde_json::from_str::<Value>(&json).unwrap(),
        toml_1_1_json()
    );

    let json = success(&["get", "-o", "json", "point"], TOML_1_1_DOCUMENT);
    assert_eq!(
        serde_json::from_str::<Value>(&json).unwrap(),
        toml_1_1_json()["point"]
    );
}

#[test]
fn get_value() {
    let get = |pattern| success(&["get", "-o", "value", pattern], TOML_1_1_DOCUMENT);

    assert_eq!(get("name"), "esc\u{1b}[0m A\u{e9}\n");
    assert_eq!(get("time"), "07:32:00\n");
    assert_eq!(get("local"), "1979-05-27T07:32:00\n");
    assert_eq!(get("1"), "numeric key\n");
    assert_eq!(get("point.y"), "2\n");
    assert_eq!(get("point.nested.a"), "1\n2\n");
    assert_eq!(get("point.nested.b.c"), "07:32:01\n");
    assert_eq!(get("table.inline.b"), "two\n");
}

#[test]
fn get_toml() {
    let toml = success(&["get", "-o", "toml"], TOML_1_1_DOCUMENT);
    let json = success(&["get", "-o", "json"], &toml);
    assert_eq!(
        serde_json::from_str::<Value>(&json).unwrap(),
        toml_1_1_json()
    );

    let toml = success(&["get", "-o", "toml", "point"], TOML_1_1_DOCUMENT);
    let json = success(&["get", "-o", "json"], &format!("point = {toml}"));
    assert_eq!(
        serde_json::from_str::<Value>(&json).unwrap(),
        json!({ "point": toml_1_1_json()["point"] })
    );
}

#[test]
fn lint() {
    success(&["lint", "--no-auto-config", "-"], TOML_1_1_DOCUMENT);
}

#[test]
fn lint_with_schema() {
    let schema = schema_url("toml-1-1-schema.json", &toml_1_1_schema());
    success(
        &["lint", "--no-auto-config", "--schema", &schema, "-"],
        TOML_1_1_DOCUMENT,
    );

    // Errors in multi-line inline tables are still found.
    let invalid = TOML_1_1_DOCUMENT.replace("y = 2,", "y = \"two\",");
    let output = taplo(
        &[
            "lint",
            "--no-auto-config",
            "--colors",
            "never",
            "--schema",
            &schema,
            "-",
        ],
        &invalid,
    );
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains(r#""two" is not of type "integer""#),
        "{stderr}"
    );
    assert!(stderr.contains("-:13:9"), "{stderr}");
}
