//! Formatter guarantees on the valid documents of toml-test v2.1.0 (TOML 1.1.0):
//! formatting never panics, keeps the data and comments, and is idempotent.

use std::panic::{catch_unwind, AssertUnwindSafe};

use crate::{
    dom::Node,
    formatter::{self, Options},
    parser::parse,
    syntax::SyntaxKind::COMMENT,
};

const TOML_TEST_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../test-data/toml-test/v2.1.0"
);

fn valid_documents() -> Vec<(String, String)> {
    let list = std::fs::read_to_string(format!("{TOML_TEST_DIR}/files-toml-1.1.0")).unwrap();

    list.lines()
        .filter(|l| l.starts_with("valid/") && l.ends_with(".toml"))
        .map(|path| {
            let src = std::fs::read(format!("{TOML_TEST_DIR}/{path}")).unwrap();
            (path.to_string(), String::from_utf8(src).unwrap())
        })
        .collect()
}

fn option_matrix() -> Vec<(String, Options)> {
    let defaults = Options::default();
    let mut matrix = vec![("defaults".to_string(), defaults.clone())];

    macro_rules! flipped {
        ($($opt:ident),*) => {
            $(
                let mut opts = defaults.clone();
                opts.$opt = !opts.$opt;
                matrix.push((format!("{} = {}", stringify!($opt), opts.$opt), opts));
            )*
        };
    }

    // Everything but `reorder_arrays`, which changes the data.
    flipped!(
        align_entries,
        align_comments,
        align_single_comments,
        array_trailing_comma,
        array_auto_expand,
        inline_table_expand,
        array_auto_collapse,
        compact_arrays,
        compact_inline_tables,
        compact_entries,
        indent_tables,
        indent_entries,
        trailing_newline,
        reorder_keys,
        reorder_inline_tables,
        crlf
    );

    for column_width in [1, 20, 40] {
        matrix.push((
            format!("column_width = {column_width}"),
            Options {
                column_width,
                ..defaults.clone()
            },
        ));
    }

    matrix.push((
        "allowed_blank_lines = 0".into(),
        Options {
            allowed_blank_lines: 0,
            ..defaults.clone()
        },
    ));

    matrix.push((
        "reorder_keys, allowed_blank_lines = 0".into(),
        Options {
            reorder_keys: true,
            allowed_blank_lines: 0,
            ..defaults.clone()
        },
    ));

    matrix.push((
        "tabs, indent_entries, indent_tables".into(),
        Options {
            indent_string: "\t".into(),
            indent_entries: true,
            indent_tables: true,
            ..defaults.clone()
        },
    ));

    let combo = Options {
        align_entries: true,
        reorder_keys: true,
        reorder_inline_tables: true,
        compact_inline_tables: true,
        column_width: 1,
        ..defaults.clone()
    };

    matrix.push((
        "align_entries, reorder_keys, reorder_inline_tables, compact_inline_tables, column_width = 1"
            .into(),
        combo.clone(),
    ));

    matrix.push((
        "align_entries, reorder_keys, reorder_inline_tables, compact_inline_tables, column_width = 1, array_auto_collapse = false"
            .into(),
        Options {
            array_auto_collapse: false,
            ..combo
        },
    ));

    matrix
}

/// The data of the document, with the type of every value.
fn tagged_data(node: &Node) -> String {
    match node {
        Node::Table(t) => {
            // The order of keys is not part of the data.
            let mut entries = t
                .entries()
                .read()
                .iter()
                .map(|(k, v)| format!("{:?}: {}", k.value(), tagged_data(v)))
                .collect::<Vec<_>>();
            entries.sort();
            format!("{{{}}}", entries.join(", "))
        }
        Node::Array(a) => format!(
            "[{}]",
            a.items()
                .read()
                .iter()
                .map(tagged_data)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        Node::Bool(b) => format!("bool({})", b.value()),
        Node::Str(s) => format!("string({:?})", s.value()),
        Node::Integer(i) => format!("integer({:?})", i.value()),
        Node::Float(f) => {
            let v = f.value();
            if v.is_nan() {
                format!("float({}nan)", if v.is_sign_negative() { "-" } else { "" })
            } else {
                format!("float({v:?})")
            }
        }
        Node::Date(d) => format!("datetime({:?})", d.value()),
        Node::Invalid(_) => "invalid".into(),
    }
}

fn decode(src: &str) -> Result<String, String> {
    let p = parse(src);

    if !p.errors.is_empty() {
        return Err(format!("syntax errors: {:?}", p.errors));
    }

    let dom = p.into_dom();

    if let Err(errors) = dom.validate() {
        return Err(format!(
            "semantic errors: {:?}",
            errors.map(|e| e.to_string()).collect::<Vec<_>>()
        ));
    }

    Ok(tagged_data(&dom))
}

fn comments(src: &str) -> Vec<String> {
    parse(src)
        .into_syntax()
        .descendants_with_tokens()
        .filter(|t| t.kind() == COMMENT)
        .map(|t| t.as_token().unwrap().text().to_string())
        .collect()
}

fn format(src: &str, options: &Options) -> Result<String, String> {
    let options = options.clone();
    catch_unwind(AssertUnwindSafe(|| formatter::format(src, options))).map_err(|err| {
        err.downcast_ref::<String>()
            .cloned()
            .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default()
    })
}

fn check(src: &str, options: &Options) -> Result<(), String> {
    let data = decode(src).map_err(|err| format!("the input is invalid: {err}"))?;

    let formatted = format(src, options).map_err(|err| format!("panicked: {err}"))?;

    let formatted_data =
        decode(&formatted).map_err(|err| format!("the output is invalid: {err}\n{formatted}"))?;

    if formatted_data != data {
        return Err(format!(
            "the data changed:\n{data}\n{formatted_data}\n{formatted}"
        ));
    }

    let mut src_comments = comments(src);
    let mut formatted_comments = comments(&formatted);

    if options.reorder_keys || options.reorder_inline_tables {
        src_comments.sort();
        formatted_comments.sort();
    }

    if src_comments != formatted_comments {
        return Err(format!(
            "the comments changed:\n{src_comments:?}\n{formatted_comments:?}\n{formatted}"
        ));
    }

    let formatted_twice =
        format(&formatted, options).map_err(|err| format!("panicked on the output: {err}"))?;

    if formatted_twice != formatted {
        return Err(format!(
            "not idempotent:\n{formatted:?}\n{formatted_twice:?}"
        ));
    }

    Ok(())
}

#[test]
fn format_toml_test_valid_documents() {
    let documents = valid_documents();
    assert_eq!(documents.len(), 214);

    let mut failures = Vec::new();

    for (path, src) in &documents {
        for (name, options) in option_matrix() {
            if let Err(err) = check(src, &options) {
                failures.push(format!("{path} ({name}): {err}"));
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
