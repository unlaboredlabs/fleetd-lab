//! Formatting of TOML 1.1 documents.
//!
//! Also includes fixes for lost comments and non-idempotent formatting
//! that were found while testing TOML 1.1 formatting.

use difference::Changeset;

use crate::{
    formatter::{self, Options, OptionsIncomplete},
    syntax::SyntaxKind,
};

macro_rules! assert_format {
    ($expected:expr, $actual:expr) => {
        if $expected != $actual {
            println!("{}", Changeset::new($actual, $expected, "\n"));
            panic!("invalid formatting");
        }
    };
}

/// Format the same way as the CLI and the language server.
fn format(src: &str, options: Options) -> String {
    let p = crate::parser::parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
    formatter::format_with_path_scopes(
        p.into_dom(),
        options,
        &[],
        Vec::<(String, OptionsIncomplete)>::new(),
    )
    .unwrap()
}

#[test]
fn multi_line_inline_table_is_kept() {
    let src = r#"server = {
  host = "localhost", # where it listens
  port = 8080,
  tls = { cert = "a.pem", key = "a.key" },
}
"#;

    assert_format!(src, &format(src, Options::default()));
}

#[test]
fn inline_table_trailing_commas() {
    let src = r#"single = { x = 1, y = 2, }
multi = {
  x = 1,
  y = 2
}
short = {
x = 1 }
"#;

    let expected = r#"single = { x = 1, y = 2 }
multi = {
  x = 1,
  y = 2,
}
short = {
  x = 1,
}
"#;

    assert_format!(expected, &format(src, Options::default()));

    let expected = r#"single = { x = 1, y = 2 }
multi = {
  x = 1,
  y = 2
}
short = {
  x = 1
}
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                array_trailing_comma: false,
                ..Default::default()
            }
        )
    );
}

#[test]
fn multi_line_inline_table_one_entry_per_line() {
    let src = r#"t = {   a = 1 ,
     b = "two"   # comment b
 , c = [ 1,2 ] ,  d = { e = 1 } }
"#;

    let expected = r#"t = {
  a = 1,
  b = "two", # comment b
  c = [1, 2],
  d = { e = 1 },
}
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn multi_line_inline_table_comments() {
    let src = r#"t = {   # after brace
      # standalone

  a = 1,  # trailing a
  bb = 22,# trailing bb
  ccc = 333,
        # before closing brace
}   # after closing brace
"#;

    let expected = r#"t = { # after brace
  # standalone

  a = 1,   # trailing a
  bb = 22, # trailing bb
  ccc = 333,
  # before closing brace
} # after closing brace
"#;

    assert_format!(expected, &format(src, Options::default()));

    let expected = r#"t = { # after brace
  # standalone

  a = 1, # trailing a
  bb = 22, # trailing bb
  ccc = 333,
  # before closing brace
} # after closing brace
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                align_comments: false,
                ..Default::default()
            }
        )
    );
}

#[test]
fn multi_line_inline_table_second_trailing_comment() {
    // Only one comment fits after an entry.
    let src = r#"t = {
  a = 1 # first
  , # second
  b = 2,
}
"#;

    let expected = r#"t = {
  a = 1, # first
  # second
  b = 2,
}
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn multi_line_inline_tables_in_arrays() {
    let src = r#"[table]
servers = [
  { name = "a", port = 1 },
  {
    name = "b",
    port = 2
  },
]
"#;

    let expected = r#"[table]
servers = [
  { name = "a", port = 1 },
  {
    name = "b",
    port = 2,
  },
]
"#;

    assert_format!(expected, &format(src, Options::default()));

    let expected = r#"[table]
  servers = [
    { name = "a", port = 1 },
    {
      name = "b",
      port = 2,
    },
  ]
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                indent_entries: true,
                ..Default::default()
            }
        )
    );
}

#[test]
fn nested_multi_line_inline_tables() {
    let src = r#"a = { b = {
c = 1 }, d = 2 }
"#;

    let expected = r#"a = {
  b = {
    c = 1,
  },
  d = 2,
}
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn multi_line_inline_table_long_lines() {
    // Only the entries that are too long are expanded.
    let src = r#"t = {
  s = "a very long string value that goes way past the column width of eighty chars",
  a = [1, 2],
  long = ["aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccc"],
}
"#;

    let expected = r#"t = {
  s = "a very long string value that goes way past the column width of eighty chars",
  a = [1, 2],
  long = [
    "aaaaaaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbbbbbbbbbb",
    "cccccccccccccccccccccc",
  ],
}
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn multi_line_inline_table_align_entries() {
    let src = r#"t = {
  a = 1, # x
  long_key = 2, # y

  b = 3,
}
"#;

    let expected = r#"t = {
  a        = 1, # x
  long_key = 2, # y

  b = 3,
}
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                align_entries: true,
                ..Default::default()
            }
        )
    );
}

#[test]
fn multi_line_inline_table_reorder() {
    let src = r#"t = {
  c = 3, # c
  b = 2,
  # group 2
  z = 1,
  a = 0
}
"#;

    let expected = r#"t = {
  b = 2,
  c = 3, # c
  # group 2
  a = 0,
  z = 1,
}
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                reorder_inline_tables: true,
                ..Default::default()
            }
        )
    );
}

#[test]
fn empty_multi_line_inline_tables() {
    let src = r#"a = {
}
b = { # comment
}
c = [{
}]
"#;

    let expected = r#"a = {}
b = { # comment
}
c = [{}]
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn multi_line_inline_table_crlf() {
    let src = "t = {\r\n  a = 1, # c\r\n  b = 2\r\n}\r\n";
    let expected = "t = {\r\n  a = 1, # c\r\n  b = 2,\r\n}\r\n";

    assert_format!(
        expected,
        &format(
            src,
            Options {
                crlf: true,
                ..Default::default()
            }
        )
    );
}

#[test]
fn removed_blank_lines_do_not_separate_groups() {
    let src = r#"b = 1
c = 2

a = 3
"#;

    let expected = r#"a = 3
b = 1
c = 2
"#;

    assert_format!(
        expected,
        &format(
            src,
            Options {
                reorder_keys: true,
                allowed_blank_lines: 0,
                ..Default::default()
            }
        )
    );
}

#[test]
fn array_second_trailing_comment() {
    let src = r#"a = [
  1 # one
  , # two
  2,
]
"#;

    let expected = r#"a = [
  1, # one
  # two
  2,
]
"#;

    assert_format!(expected, &format(src, Options::default()));
}

#[test]
fn blank_lines_around_moved_commas() {
    // The comma is moved after the value, there must not be more blank lines than allowed.
    let src = "a = [\n  1 # one\n\n\n  ,\n  2,\n]\nt = {\n  a = 1\n\n\n  ,\n  b = 2,\n}\n";
    let expected = "a = [\n  1, # one\n\n\n  2,\n]\nt = {\n  a = 1,\n\n\n  b = 2,\n}\n";

    let formatted = format(src, Options::default());
    assert_format!(expected, &formatted);
    assert_format!(expected, &format(&formatted, Options::default()));
}

#[test]
fn reorder_inline_tables_is_idempotent() {
    let src = r#"t = { key20 = 1, key2  = [ 1 ] }
"#;

    let options = Options {
        reorder_inline_tables: true,
        compact_entries: true,
        ..Default::default()
    };

    let expected = r#"t={ key20=1, key2=[1] }
"#;

    let formatted = format(src, options.clone());
    assert_format!(expected, &formatted);

    let formatted_again = format(&formatted, options);
    assert_format!(expected, &formatted_again);
}

#[test]
fn toml_1_1_values_are_kept() {
    let src = r#"esc = "\e[0m \x41"
time = 07:32
date-time = 1979-05-27 07:32Z
"#;

    assert_format!(src, &format(src, Options::default()));
}

/// Data and comments of a document, used to check that formatting changes neither.
fn analyze(src: &str) -> (serde_json::Value, Vec<String>) {
    let p = crate::parser::parse(src);
    assert!(p.errors.is_empty(), "{:#?}\n{src}", p.errors);

    let comments = p
        .clone()
        .into_syntax()
        .descendants_with_tokens()
        .filter(|t| t.kind() == SyntaxKind::COMMENT)
        .map(|t| t.to_string())
        .collect();

    let dom = p.into_dom();
    assert!(dom.validate().is_ok(), "{src}");

    (serde_json::to_value(&dom).unwrap(), comments)
}

#[test]
fn formatting_toml_1_1_is_idempotent_and_lossless() {
    let documents = [
        r#"
# TOML 1.1 supports newlines in inline tables and trailing commas.
trailing-comma-1 = {
  c = 1,
}
trailing-comma-2 = { c = 1, }
tbl-1 = {
  hello = "world",
  1     = 2,
  arr   = [1,
           2,
           3,
          ],
  tbl = {
     k = 1,
  }
}
tbl-2 = {
  k = """
  Hello
  """
}
no-newline-before-brace = {
  a = 1,
  b = 2}
"#,
        r#"
tbl = { # comment after brace
  # standalone comment

  key = "value"  # comment after value
  , other = 1, # comment after comma


  nested = { a = [ # in array
    1, # one
    2,
  ], b = {
    # deep
  } },
  arr = [{
    x = 1, y = 2
  }, { z = 3 }],
  # last comment
} # after table

[[aot]]
x = { a = 1, b = { c = 2,
  d = 3 } }   # comment
y = [ { a = { b = 1,
} } ]
"#,
        "crlf = {\r\n  a = 1, # c\r\n\r\n  b = 2\r\n}\r\n",
    ];

    let mut option_sets = vec![Options::default()];
    let toggles: [fn(&mut Options); 16] = [
        |o| o.align_entries = true,
        |o| o.align_comments = false,
        |o| o.align_single_comments = false,
        |o| o.array_trailing_comma = false,
        |o| o.array_auto_expand = false,
        |o| o.inline_table_expand = false,
        |o| o.array_auto_collapse = false,
        |o| o.compact_arrays = false,
        |o| o.compact_inline_tables = true,
        |o| o.compact_entries = true,
        |o| o.column_width = 1,
        |o| o.indent_tables = true,
        |o| o.indent_entries = true,
        |o| o.reorder_keys = true,
        |o| o.reorder_inline_tables = true,
        |o| o.allowed_blank_lines = 0,
    ];
    for toggle in toggles {
        let mut options = Options::default();
        toggle(&mut options);
        option_sets.push(options);
    }
    option_sets.push(Options {
        align_entries: true,
        indent_entries: true,
        indent_tables: true,
        column_width: 20,
        indent_string: "\t".into(),
        crlf: true,
        trailing_newline: false,
        ..Default::default()
    });

    for src in documents {
        let (data, comments) = analyze(src);

        for options in &option_sets {
            let formatted = format(src, options.clone());
            let (formatted_data, mut formatted_comments) = analyze(&formatted);

            assert_eq!(data, formatted_data, "{options:?}\n{formatted}");

            let mut comments = comments.clone();
            if options.reorder_keys || options.reorder_inline_tables {
                comments.sort();
                formatted_comments.sort();
            }
            assert_eq!(comments, formatted_comments, "{options:?}\n{formatted}");

            assert_format!(&formatted, &format(&formatted, options.clone()));
        }
    }
}
