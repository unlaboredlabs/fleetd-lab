//! Formats every valid document of toml-test v2.1.0 (vendored in `test-data/toml-test`)
//! with several sets of options, and checks that formatting never panics, keeps the data
//! and the comments, produces valid TOML and is idempotent.

use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
};

use crate::{
    dom::Node,
    formatter::{self, Options},
    parser::parse,
    syntax::SyntaxKind,
};

fn option_sets() -> Vec<(&'static str, Options)> {
    vec![
        ("default", Options::default()),
        (
            "tiny_column_width",
            Options {
                column_width: 1,
                ..Default::default()
            },
        ),
        (
            "large_column_width",
            Options {
                column_width: 10000,
                ..Default::default()
            },
        ),
        (
            "no_auto_layout",
            Options {
                array_auto_expand: false,
                array_auto_collapse: false,
                array_trailing_comma: false,
                inline_table_expand: false,
                ..Default::default()
            },
        ),
        (
            "compact",
            Options {
                compact_arrays: false,
                compact_inline_tables: true,
                compact_entries: true,
                align_comments: false,
                ..Default::default()
            },
        ),
        (
            "aligned_indented",
            Options {
                align_entries: true,
                align_single_comments: false,
                indent_tables: true,
                indent_entries: true,
                indent_string: "\t".into(),
                column_width: 20,
                ..Default::default()
            },
        ),
        (
            "reorder",
            Options {
                reorder_keys: true,
                reorder_inline_tables: true,
                align_entries: true,
                ..Default::default()
            },
        ),
        (
            "crlf_no_blank_lines",
            Options {
                crlf: true,
                trailing_newline: false,
                allowed_blank_lines: 0,
                array_auto_collapse: false,
                ..Default::default()
            },
        ),
        (
            "narrow_no_trailing_comma",
            Options {
                column_width: 1,
                array_trailing_comma: false,
                array_auto_collapse: false,
                inline_table_expand: false,
                indent_string: "    ".into(),
                indent_entries: true,
                align_entries: true,
                compact_inline_tables: true,
                ..Default::default()
            },
        ),
    ]
}

/// Pseudo-random combinations of all options except `reorder_arrays`,
/// which changes the data on purpose.
fn random_option_sets(count: usize) -> Vec<Options> {
    let mut state = 0x2545_f491_4f6c_dd1d_u64;
    let mut next = move |n: usize| {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state % n as u64) as usize
    };

    (0..count)
        .map(|_| Options {
            align_entries: next(2) == 0,
            align_comments: next(2) == 0,
            align_single_comments: next(2) == 0,
            array_trailing_comma: next(2) == 0,
            array_auto_expand: next(2) == 0,
            inline_table_expand: next(2) == 0,
            array_auto_collapse: next(2) == 0,
            compact_arrays: next(2) == 0,
            compact_inline_tables: next(2) == 0,
            compact_entries: next(2) == 0,
            column_width: [0, 1, 10, 30, 80, 120, 10000][next(7)],
            indent_tables: next(2) == 0,
            indent_entries: next(2) == 0,
            indent_string: ["", " ", "  ", "\t", "    "][next(5)].into(),
            trailing_newline: next(2) == 0,
            reorder_keys: next(2) == 0,
            reorder_arrays: false,
            reorder_inline_tables: next(2) == 0,
            allowed_blank_lines: [0, 1, 2, 5][next(4)],
            crlf: next(2) == 0,
        })
        .collect()
}

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

/// A string representation of the data of a document,
/// independent of its formatting.
fn data(node: &Node) -> String {
    match node {
        Node::Table(t) => {
            let entries = t.entries().read();
            let mut entries = entries
                .iter()
                .map(|(k, v)| format!("{:?}: {}", k.value(), data(v)))
                .collect::<Vec<_>>();
            entries.sort();
            format!("{{{}}}", entries.join(", "))
        }
        Node::Array(a) => {
            let items = a.items().read();
            format!(
                "[{}]",
                items.iter().map(data).collect::<Vec<_>>().join(", ")
            )
        }
        Node::Bool(b) => format!("bool({})", b.value()),
        Node::Str(s) => format!("str({:?})", s.value()),
        Node::Integer(i) => format!("int({:?})", i.value()),
        Node::Float(f) => format!("float({:?})", f.value()),
        Node::Date(d) => format!("date({:?})", d.value()),
        Node::Invalid(_) => "invalid".into(),
    }
}

/// Parses a document that must be valid and returns its data and comments.
fn parse_valid(src: &str) -> Result<(String, Vec<String>), String> {
    let p = parse(src);
    if !p.errors.is_empty() {
        return Err(format!("syntax errors: {:?}", p.errors));
    }

    let comments = p
        .clone()
        .into_syntax()
        .descendants_with_tokens()
        .filter(|t| t.kind() == SyntaxKind::COMMENT)
        .map(|t| t.into_token().unwrap().text().to_string())
        .collect();

    let dom = p.into_dom();
    if let Err(errors) = dom.validate() {
        return Err(format!(
            "invalid document: {:?}",
            errors.collect::<Vec<_>>()
        ));
    }

    Ok((data(&dom), comments))
}

/// Formats like `taplo fmt` does.
fn format(src: &str, options: &Options) -> Result<String, String> {
    catch_unwind(AssertUnwindSafe(|| {
        formatter::format_with_path_scopes(
            parse(src).into_dom(),
            options.clone(),
            &[],
            Vec::<(String, _)>::new(),
        )
        .unwrap()
    }))
    .map_err(|err| {
        format!(
            "formatter panicked: {}",
            err.downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| err.downcast_ref::<String>().cloned())
                .unwrap_or_default()
        )
    })
}

fn check(src: &str, options: &Options) -> Result<(), String> {
    let (data, mut comments) = parse_valid(src).map_err(|err| format!("original: {err}"))?;

    let formatted = format(src, options)?;
    let (formatted_data, mut formatted_comments) =
        parse_valid(&formatted).map_err(|err| format!("formatted: {err}\n{formatted}"))?;

    if data != formatted_data {
        return Err(format!(
            "data changed:\n{data}\n{formatted_data}\nformatted:\n{formatted}"
        ));
    }

    if options.reorder_keys || options.reorder_inline_tables {
        comments.sort();
        formatted_comments.sort();
    }

    if comments != formatted_comments {
        return Err(format!(
            "comments changed:\n{comments:?}\n{formatted_comments:?}\nformatted:\n{formatted}"
        ));
    }

    let reformatted = format(&formatted, options).map_err(|err| format!("reformatting: {err}"))?;
    if reformatted != formatted {
        return Err(format!(
            "not idempotent:\nformatted:\n{formatted}\nformatted again:\n{reformatted}"
        ));
    }

    Ok(())
}

#[test]
fn format_toml_test_valid() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test-data/toml-test/valid");
    let mut files = Vec::new();
    toml_files(&dir, &mut files);
    files.sort();
    assert!(files.len() > 200, "toml-test files not found in {dir:?}");

    let mut failures = Vec::new();

    let mut option_sets = option_sets()
        .into_iter()
        .map(|(name, options)| (name.to_string(), options))
        .collect::<Vec<_>>();
    option_sets.extend(
        random_option_sets(48)
            .into_iter()
            .enumerate()
            .map(|(idx, options)| (format!("random {idx}: {options:?}"), options)),
    );

    let documents = files
        .iter()
        .map(|path| {
            (
                path.strip_prefix(&dir).unwrap().display().to_string(),
                std::fs::read_to_string(path).unwrap(),
            )
        })
        .chain(
            DOCUMENTS
                .iter()
                .enumerate()
                .map(|(idx, src)| (format!("DOCUMENTS[{idx}]"), src.to_string())),
        );

    for (name, src) in documents {
        for (options_name, options) in &option_sets {
            if let Err(err) = check(&src, options) {
                failures.push(format!("{name} ({options_name}): {err}"));
            }
        }
    }

    assert!(
        failures.is_empty(),
        "{} failures:\n\n{}",
        failures.len(),
        failures.join("\n\n")
    );
}

/// Additional TOML 1.1 documents with newlines and comments in inline tables.
const DOCUMENTS: &[&str] = &[
    r#"server = {
  host = "localhost", # where it listens
  port = 8080,
  tls = { cert = "a.pem", key = "a.key" },
}
"#,
    "a = { x = 1 # c1\n, y = 2, # c2\n  z = [1, # c3\n  ] # c4\n  , w = 3 }\n",
    "a = {\n}\nb = { # c\n}\nc = {\n  # c\n}\nd = {\n\n\n\n  # c\n\n\n}\n",
    "a = { b = {\n  c = 1 } }\nd = [{\n  e = 1 }, { f = 2,\n}]\n",
    "a = [ { b = 1,\n  c = [\n 1, 2, # x\n ] }, # y\n  # z\n  { d = 1 } ]\n",
    "[t]\na = { z = 1,\n\n\n\n  y = 2, # y\n  x = 3 # x\n  ,\n  # w\n  w = 4 }\n[t.u]\nb = { c.d = 1,\n c.e = 2 }\n",
    "a = { b = 1 # b\n, # comma\n c = 2 }\n",
    "a = {\n  long_key_name = \"a very long string value that does not fit in narrow columns\",\n  arr = [\"aaaaaaaaaaaa\", \"bbbbbbbbbbbbbbb\", \"cccccccccccccccc\", \"dddddddddddddd\"],\n  t = { x = [\"aaaaaaaaaaaa\", \"bbbbbbbbbbbbbbb\", \"cccccccccccccccc\", \"dddddddddddddd\"] },\n}\n",
    "a = {\r\n  b = 1, # b\r\n\r\n  c = \"\"\"\r\nx\r\n\"\"\", # c\r\n}\r\n",
    "a = { b = 1, }\nc = { d = 1, e = 2, } # c\n",
    "a = {\n  b = 1 } # a\nc = 2\nd = [\n  {\n    e = 1,\n  },\n]\n",
    "# top\n\n[x] # x\ny = {   # y\n\t  z = 'z' ,   # z\n  \t\n  w = { v = {\n  u = 1\n  }\n  }\n}\n",
    "a.b = { c = 1,\n d = 2 }\na.e = {\n f = [ # f\n ] }\n",
    "[[arr]]\nx = {\n  y = 1,\n}\n[[arr]]\nx = { y = 2 }\n",
];
