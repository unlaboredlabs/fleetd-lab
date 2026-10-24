//! Formats the valid documents of toml-test (see `test-data/toml-test`)
//! with many option combinations, and checks that formatting keeps the data
//! and the comments, produces valid TOML, and is idempotent.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{
    dom::{node::IntegerValue, Node},
    formatter::{self, Options},
    parser::parse,
    syntax::SyntaxKind,
};

fn toml_files(dir: &Path, files: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            toml_files(&path, files);
        } else if path.extension().is_some_and(|ext| ext == "toml") {
            files.push(path);
        }
    }
}

/// The data of a document with the types of values, like toml-test's JSON.
fn data(node: &Node) -> Value {
    match node {
        Node::Table(table) => Value::Object(
            table
                .entries()
                .read()
                .iter()
                .map(|(key, value)| (key.value().to_string(), data(value)))
                .collect(),
        ),
        Node::Array(array) => Value::Array(array.items().read().iter().map(data).collect()),
        Node::Bool(b) => json!({ "bool": b.value() }),
        Node::Str(s) => json!({ "string": s.value() }),
        Node::Integer(i) => json!({
            "integer": match i.value() {
                IntegerValue::Negative(i) => i.to_string(),
                IntegerValue::Positive(i) => i.to_string(),
            }
        }),
        Node::Float(f) => json!({ "float": format!("{:?}", f.value()) }),
        Node::Date(d) => json!({ "date": format!("{:?}", d.value()) }),
        Node::Invalid(_) => unreachable!(),
    }
}

fn decode(src: &str) -> Result<Value, String> {
    let parse = parse(src);
    if !parse.errors.is_empty() {
        return Err(format!("{:#?}", parse.errors));
    }
    let dom = parse.into_dom();
    if let Err(errors) = dom.validate() {
        return Err(format!("{:#?}", errors.collect::<Vec<_>>()));
    }
    Ok(data(&dom))
}

fn comments(src: &str) -> Vec<String> {
    let mut comments = parse(src)
        .into_syntax()
        .descendants_with_tokens()
        .filter(|t| t.kind() == SyntaxKind::COMMENT)
        .map(|t| t.into_token().unwrap().text().to_string())
        .collect::<Vec<_>>();
    comments.sort();
    comments
}

/// Formats like `taplo fmt` does.
fn format(src: &str, options: &Options) -> String {
    let dom = parse(src).into_dom();
    formatter::format_with_path_scopes(dom, options.clone(), &[], Vec::<(&str, _)>::new()).unwrap()
}

fn option_sets() -> Vec<Options> {
    let d = Options::default;

    let mut sets = vec![
        d(),
        Options {
            align_entries: true,
            ..d()
        },
        Options {
            align_comments: false,
            ..d()
        },
        Options {
            align_single_comments: false,
            ..d()
        },
        Options {
            array_trailing_comma: false,
            ..d()
        },
        Options {
            array_auto_expand: false,
            ..d()
        },
        Options {
            array_auto_collapse: false,
            ..d()
        },
        Options {
            compact_arrays: false,
            ..d()
        },
        Options {
            compact_inline_tables: true,
            ..d()
        },
        Options {
            compact_entries: true,
            ..d()
        },
        Options {
            column_width: 1,
            ..d()
        },
        Options {
            column_width: 10,
            inline_table_expand: false,
            ..d()
        },
        Options {
            column_width: 100_000,
            ..d()
        },
        Options {
            indent_tables: true,
            indent_entries: true,
            ..d()
        },
        Options {
            indent_entries: true,
            indent_string: "\t".into(),
            ..d()
        },
        Options {
            reorder_keys: true,
            reorder_inline_tables: true,
            ..d()
        },
        Options {
            allowed_blank_lines: 0,
            ..d()
        },
        Options {
            allowed_blank_lines: 5,
            ..d()
        },
        Options {
            trailing_newline: false,
            ..d()
        },
        Options { crlf: true, ..d() },
    ];

    // Some arbitrary combinations as well.
    let mut state: u64 = 0x2545_f491_4f6c_dd1d;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    for _ in 0..16 {
        let mut b = || next() % 2 == 0;
        let mut o = Options {
            align_entries: b(),
            align_comments: b(),
            align_single_comments: b(),
            array_trailing_comma: b(),
            array_auto_expand: b(),
            inline_table_expand: b(),
            array_auto_collapse: b(),
            compact_arrays: b(),
            compact_inline_tables: b(),
            compact_entries: b(),
            indent_tables: b(),
            indent_entries: b(),
            trailing_newline: b(),
            reorder_keys: b(),
            reorder_inline_tables: b(),
            crlf: b(),
            ..d()
        };
        o.column_width = [1, 20, 40, 80, 120, 100_000][(next() % 6) as usize];
        o.allowed_blank_lines = (next() % 4) as usize;
        o.indent_string = ["  ", "\t", "    "][(next() % 3) as usize].into();
        sets.push(o);
    }

    sets
}

#[test]
fn format_toml_test_valid() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test-data/toml-test/valid");
    let mut files = Vec::new();
    toml_files(&dir, &mut files);
    files.sort();
    assert!(files.len() > 200);

    let sets = option_sets();
    let mut failures = Vec::new();

    for path in &files {
        let src = std::fs::read_to_string(path).unwrap();
        let name = path.strip_prefix(&dir).unwrap().display();
        let data = decode(&src).unwrap_or_else(|err| panic!("{name}: {err}"));
        let src_comments = comments(&src);

        for options in &sets {
            let formatted = format(&src, options);

            let error = match decode(&formatted) {
                Err(err) => Some(format!("invalid output: {err}")),
                Ok(d) if d != data => Some("data changed".to_string()),
                Ok(_) if comments(&formatted) != src_comments => {
                    Some("comments changed".to_string())
                }
                Ok(_) if format(&formatted, options) != formatted => {
                    Some("not idempotent".to_string())
                }
                Ok(_) => None,
            };

            if let Some(error) = error {
                failures.push(format!("{name}: {error}\n{options:?}\n{formatted}"));
            }
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n\n"));
}
