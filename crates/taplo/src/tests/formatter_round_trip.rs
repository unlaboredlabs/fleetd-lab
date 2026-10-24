//! Round-trip checks of the formatter: formatting a valid document must not panic,
//! must keep the data and every comment, and formatting the output again
//! must not change it.

use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

use serde_json::{json, Map, Value};

use crate::{
    dom::{node::IntegerValue, Node},
    formatter::{self, Options},
    parser::parse,
    syntax::SyntaxKind,
};

/// The data of a document, with the type of every value.
fn typed_data(node: &Node) -> Value {
    match node {
        Node::Table(t) => Value::Object(
            t.entries()
                .read()
                .iter()
                .map(|(k, v)| (k.value().to_string(), typed_data(v)))
                .collect::<Map<_, _>>(),
        ),
        Node::Array(arr) => Value::Array(arr.items().read().iter().map(typed_data).collect()),
        Node::Bool(v) => json!({ "bool": v.value() }),
        Node::Str(v) => json!({ "string": v.value() }),
        Node::Integer(v) => match v.value() {
            IntegerValue::Negative(v) => json!({ "integer": v }),
            IntegerValue::Positive(v) => json!({ "integer": v }),
        },
        Node::Float(v) => {
            let v = v.value();
            json!({ "float": if v.is_nan() { "nan".to_string() } else { format!("{v:?}") } })
        }
        Node::Date(v) => json!({ "datetime": format!("{:?}", v.value()) }),
        Node::Invalid(_) => json!("invalid"),
    }
}

/// Parses a document that must be valid and returns its data.
fn decode(src: &str) -> Result<Value, String> {
    let p = parse(src);
    if !p.errors.is_empty() {
        return Err(format!("syntax errors: {:?}", p.errors));
    }
    let dom = p.into_dom();
    if let Err(errors) = dom.validate() {
        return Err(format!("semantic errors: {:?}", errors.collect::<Vec<_>>()));
    }
    Ok(typed_data(&dom))
}

/// The sorted texts of all comments in a document.
fn comments(src: &str) -> Vec<String> {
    let mut comments = parse(src)
        .into_syntax()
        .descendants_with_tokens()
        .filter(|t| t.kind() == SyntaxKind::COMMENT)
        .map(|t| t.as_token().unwrap().text().to_string())
        .collect::<Vec<_>>();
    comments.sort();
    comments
}

fn format(src: &str, options: &Options) -> Result<String, String> {
    catch_unwind(AssertUnwindSafe(|| formatter::format(src, options.clone()))).map_err(|err| {
        let message = err
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default();
        format!("panicked: {message}")
    })
}

/// Formats a valid document and checks that the data and comments are kept,
/// and that the formatting is idempotent.
fn check_round_trip(src: &str, options: &Options) -> Result<(), String> {
    let data = decode(src).map_err(|err| format!("invalid input: {err}"))?;

    let formatted = format(src, options)?;

    let formatted_data =
        decode(&formatted).map_err(|err| format!("invalid output: {err}\n{formatted}"))?;
    if formatted_data != data {
        return Err(format!(
            "data changed:\n{data:#}\n{formatted_data:#}\n---\n{formatted}"
        ));
    }

    if comments(&formatted) != comments(src) {
        return Err(format!("comments changed:\n{formatted}"));
    }

    let reformatted = format(&formatted, options)?;
    if reformatted != formatted {
        let line = formatted
            .split_inclusive('\n')
            .zip(reformatted.split_inclusive('\n'))
            .position(|(a, b)| a != b)
            .unwrap_or_else(|| formatted.lines().count().min(reformatted.lines().count()));
        let tail = |s: &str| {
            s.split_inclusive('\n')
                .skip(line)
                .take(3)
                .collect::<String>()
        };
        return Err(format!(
            "not idempotent at line {}: {:?} became {:?}\n{formatted}",
            line + 1,
            tail(&formatted),
            tail(&reformatted),
        ));
    }

    Ok(())
}

/// A broad sweep of formatter options, every option except `reorder_arrays`,
/// which changes the data on purpose.
///
/// With `exhaustive`, all combinations of the boolean options are returned.
fn option_sweep(exhaustive: bool) -> Vec<Options> {
    const FLAGS: usize = 16;

    fn with_flags(flags: u32, variant: usize) -> Options {
        let flag = |i: usize| flags & (1 << i) != 0;
        Options {
            align_entries: flag(0),
            align_comments: flag(1),
            align_single_comments: flag(2),
            array_trailing_comma: flag(3),
            array_auto_expand: flag(4),
            inline_table_expand: flag(5),
            array_auto_collapse: flag(6),
            compact_arrays: flag(7),
            compact_inline_tables: flag(8),
            compact_entries: flag(9),
            indent_tables: flag(10),
            indent_entries: flag(11),
            trailing_newline: flag(12),
            reorder_keys: flag(13),
            reorder_inline_tables: flag(14),
            crlf: flag(15),
            column_width: [80, 1, 20, 40, 1000][variant % 5],
            indent_string: ["  ", "\t", "    "][variant % 3].into(),
            allowed_blank_lines: [2, 0, 1][variant / 3 % 3],
            reorder_arrays: false,
        }
    }

    let mut all = vec![Options::default()];

    if exhaustive {
        for (variant, flags) in (0..1u32 << FLAGS).enumerate() {
            all.push(with_flags(flags, variant));
        }
        return all;
    }

    // Each option on its own, starting from the defaults.
    let default = Options::default();
    for column_width in [1, 20, 40, 1000] {
        all.push(Options {
            column_width,
            ..default.clone()
        });
    }
    all.push(Options {
        indent_string: "\t".into(),
        ..default.clone()
    });
    for allowed_blank_lines in [0, 1] {
        all.push(Options {
            allowed_blank_lines,
            ..default.clone()
        });
    }

    let default_flags = (0..FLAGS)
        .filter(|&i| option_flag(&default, i))
        .fold(0, |acc, i| acc | (1 << i));

    for i in 0..FLAGS {
        all.push(with_flags(default_flags ^ (1 << i), 0));
    }

    // Pairs of options, with varying widths and indents.
    let mut variant = 1;
    for i in 0..FLAGS {
        for j in i + 1..FLAGS {
            all.push(with_flags(default_flags ^ (1 << i) ^ (1 << j), variant));
            variant += 1;
        }
    }

    // And a deterministic sample of all combinations.
    let mut state = 0x2545_f491_u32;
    for variant in 0..256 {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        all.push(with_flags(state & ((1 << FLAGS) - 1), variant));
    }

    all
}

fn option_flag(o: &Options, i: usize) -> bool {
    [
        o.align_entries,
        o.align_comments,
        o.align_single_comments,
        o.array_trailing_comma,
        o.array_auto_expand,
        o.inline_table_expand,
        o.array_auto_collapse,
        o.compact_arrays,
        o.compact_inline_tables,
        o.compact_entries,
        o.indent_tables,
        o.indent_entries,
        o.trailing_newline,
        o.reorder_keys,
        o.reorder_inline_tables,
        o.crlf,
    ][i]
}

fn toml_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut dirs = vec![dir.to_path_buf()];
    while let Some(dir) = dirs.pop() {
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                dirs.push(path);
            } else if path.extension().is_some_and(|ext| ext == "toml") {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

fn check_files(files: &[PathBuf], options: &[Options]) {
    let next = AtomicUsize::new(0);
    let failures = Mutex::new(Vec::new());

    std::thread::scope(|s| {
        for _ in 0..std::thread::available_parallelism().map_or(1, |n| n.get()) {
            s.spawn(|| {
                while let Some(path) = files.get(next.fetch_add(1, Ordering::Relaxed)) {
                    let src = std::fs::read_to_string(path).unwrap();
                    for opts in options {
                        if let Err(err) = check_round_trip(&src, opts) {
                            failures
                                .lock()
                                .unwrap()
                                .push(format!("{}\n{opts:?}\n{err}", path.display()));
                            // One failure per file is enough.
                            break;
                        }
                    }
                }
            });
        }
    });

    let mut failures = failures.into_inner().unwrap();
    failures.sort();

    assert!(
        failures.is_empty(),
        "{} of {} files failed:\n\n{}",
        failures.len(),
        files.len(),
        failures.join("\n\n")
    );
}

#[test]
fn round_trip_toml_1_1_documents() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test-data/formatter/toml-1.1");
    let files = toml_files(&dir);
    assert!(!files.is_empty());

    check_files(&files, &option_sweep(false));
}

/// Runs the round-trip checks over every valid document of toml-test
/// with all combinations of the boolean options.
///
/// ```sh
/// TOML_TEST_DIR=path/to/toml-test/tests cargo test -p taplo --release \
///     toml_test_round_trip -- --ignored
/// ```
#[test]
#[ignore = "needs a toml-test checkout, see TOML_TEST_DIR"]
fn toml_test_round_trip() {
    let dir = PathBuf::from(std::env::var("TOML_TEST_DIR").expect("TOML_TEST_DIR is not set"));
    let files = toml_files(&dir.join("valid"));
    assert!(!files.is_empty());

    check_files(&files, &option_sweep(true));
}
