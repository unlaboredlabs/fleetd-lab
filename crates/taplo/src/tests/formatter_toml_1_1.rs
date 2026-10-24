//! Formatting of TOML 1.1 documents, mainly multi-line inline tables.

use difference::Changeset;

use crate::formatter::{self, Options};

macro_rules! assert_format {
    ($expected:expr, $actual:expr) => {
        if $expected != $actual {
            println!("{}", Changeset::new($actual, $expected, "\n"));
            panic!("invalid formatting");
        }
    };
}

/// Formats `src`, and checks that formatting the result again changes nothing.
fn check(src: &str, expected: &str, options: Options) {
    let formatted = formatter::format(src, options.clone());
    assert_format!(expected, &formatted);
    let formatted = formatter::format(&formatted, options);
    assert_format!(expected, &formatted);
}

#[test]
fn multi_line_inline_table_example() {
    let src = r#"server = {
  host = "localhost", # where it listens
  port = 8080,
  tls = { cert = "a.pem", key = "a.key" },
}
"#;

    check(src, src, Options::default());
}

#[test]
fn multi_line_inline_table_layout() {
    let src = r#"server   =   {host="localhost",
	port=8080
	, tls={ cert = "a.pem",key = "a.key" },  }
"#;

    let expected = r#"server = {
  host = "localhost",
  port = 8080,
  tls = { cert = "a.pem", key = "a.key" },
}
"#;

    check(src, expected, Options::default());
}

#[test]
fn multi_line_inline_table_stays_multi_line() {
    let src = r#"a = { x = 1, y = 2, }
b = {
  x = 1 }
c = {
}
"#;

    let expected = r#"a = { x = 1, y = 2 }
b = {
  x = 1,
}
c = {
}
"#;

    check(src, expected, Options::default());
    check(
        src,
        expected,
        Options {
            column_width: 5,
            ..Default::default()
        },
    );
    check(
        src,
        expected,
        Options {
            column_width: 1000,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_nested() {
    let src = r#"outer = { a = { b = {
  c = 1 } }, d = 2 }
arr = [{
  x = 1 }, 2, { y = [ {
    z = 3,
  } ] }]
x = [
  { a = 1 }, # one
  {
    b = 2, # two
  }, # after
]
"#;

    let expected = r#"outer = {
  a = {
    b = {
      c = 1,
    },
  },
  d = 2,
}
arr = [
  {
    x = 1,
  },
  2,
  {
    y = [
      {
        z = 3,
      },
    ],
  },
]
x = [
  { a = 1 }, # one
  {
    b = 2, # two
  }, # after
]
"#;

    check(src, expected, Options::default());
}

#[test]
fn multi_line_inline_table_comments() {
    let src = r#"a = { # after brace
  # before first
  x = 1 # between value and comma
  , y = 2, # after comma
  z = 3 # first
  , # second
  # before nested
  n = { # nested brace
    k = "v" # nested value
  } # after nested
  , arr = [1, # in array
    2] # after array
  # before closing
} # after closing
b = {
  # only comment
}
c = { # brace comment only
}
f = {#c1
	#c2

	#c3
}
"#;

    let expected = r#"a = { # after brace
  # before first
  x = 1, # between value and comma
  y = 2, # after comma
  z = 3, # first
  # second
  # before nested
  n = { # nested brace
    k = "v", # nested value
  }, # after nested
  arr = [
    1, # in array
    2,
  ], # after array
  # before closing
} # after closing
b = {
  # only comment
}
c = { # brace comment only
}
f = { #c1
  #c2

  #c3
}
"#;

    check(src, expected, Options::default());
}

#[test]
fn multi_line_inline_table_trailing_comma() {
    let src = r#"t = {
  a = 1, # c
  b = { c = 2,
  },
}
"#;

    check(
        src,
        r#"t = {
  a = 1, # c
  b = {
    c = 2,
  },
}
"#,
        Options::default(),
    );

    check(
        src,
        r#"t = {
  a = 1, # c
  b = {
    c = 2
  }
}
"#,
        Options {
            array_trailing_comma: false,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_indentation() {
    let src = r#"[t]
a = [{
  x = 1 }]
b = { x = {
  y = 1 } }

[t.u]
c = {
  d = 1,
}
"#;

    check(
        src,
        r#"[t]
a = [
  {
    x = 1,
  },
]
b = {
  x = {
    y = 1,
  },
}

[t.u]
c = {
  d = 1,
}
"#,
        Options::default(),
    );

    check(
        src,
        r#"[t]
    a = [
        {
            x = 1,
        },
    ]
    b = {
        x = {
            y = 1,
        },
    }

    [t.u]
        c = {
            d = 1,
        }
"#,
        Options {
            indent_entries: true,
            indent_tables: true,
            indent_string: "    ".into(),
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_blank_lines() {
    let src = "t = {\n\n  a = 1,\n\n  b = 2,\n   \n\t\n  c = 3,\n\n\n\n  d = 4,\n\n}\n";

    check(
        src,
        "t = {\n\n  a = 1,\n\n  b = 2,\n\n\n  c = 3,\n\n\n  d = 4,\n\n}\n",
        Options::default(),
    );

    check(
        src,
        "t = {\n  a = 1,\n  b = 2,\n  c = 3,\n  d = 4,\n}\n",
        Options {
            allowed_blank_lines: 0,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_reorder() {
    let src = r#"t = {
  b = 2, # b
  a = 1, # a

  d = 4,
  # c
  c = 3
}
"#;

    check(
        src,
        r#"t = {
  a = 1, # a
  b = 2, # b

  d = 4,
  # c
  c = 3,
}
"#,
        Options {
            reorder_inline_tables: true,
            ..Default::default()
        },
    );

    // Keys are reordered by `reorder_inline_tables` only.
    check(
        src,
        r#"t = {
  b = 2, # b
  a = 1, # a

  d = 4,
  # c
  c = 3,
}
"#,
        Options {
            reorder_keys: true,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_alignment() {
    let src = r#"t = {
  a = 1, # a
  bbb = 22, # bb
  cc = 3,
}
"#;

    check(
        src,
        r#"t = {
  a = 1,    # a
  bbb = 22, # bb
  cc = 3,
}
"#,
        Options::default(),
    );

    check(
        src,
        r#"t = {
  a   = 1,  # a
  bbb = 22, # bb
  cc  = 3,
}
"#,
        Options {
            align_entries: true,
            ..Default::default()
        },
    );

    check(
        src,
        r#"t={
  a=1, # a
  bbb=22, # bb
  cc=3,
}
"#,
        Options {
            align_comments: false,
            compact_entries: true,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_column_width() {
    let src = r#"t = {
  a = [1, 2, 3],
  b = [1, 2, 3], # comment
  c = 1,
}
"#;

    check(src, src, Options::default());

    check(
        src,
        r#"t = {
  a = [
    1,
    2,
    3,
  ],
  b = [
    1,
    2,
    3,
  ], # comment
  c = 1,
}
"#,
        Options {
            column_width: 14,
            ..Default::default()
        },
    );
}

#[test]
fn multi_line_inline_table_crlf() {
    let src = "t = {\r\n  a = 1, # c\r\n  b = { c = 2,\r\n  },\r\n}\r\nu = { x = 1 }\r\n";

    check(
        src,
        "t = {\r\n  a = 1, # c\r\n  b = {\r\n    c = 2,\r\n  },\r\n}\r\nu = { x = 1 }\r\n",
        Options {
            crlf: true,
            ..Default::default()
        },
    );
}

/// A value followed by two comments, from toml-test `valid/comment/tricky.toml`.
#[test]
fn array_value_with_two_comments() {
    let src = r#"arr = [ 1,# 9, 9,
2#,9
,#9
3]
"#;

    check(
        src,
        r#"arr = [
  1, # 9, 9,
  2, #,9
  #9
  3,
]
"#,
        Options::default(),
    );
}

/// Blank lines that are removed must not separate the groups of entries.
#[test]
fn no_blank_lines_groups() {
    let src = r#"b = 1
a = 2

d = 3
c = 4
"#;

    check(
        src,
        r#"a = 2
b = 1
c = 4
d = 3
"#,
        Options {
            reorder_keys: true,
            allowed_blank_lines: 0,
            ..Default::default()
        },
    );
}
