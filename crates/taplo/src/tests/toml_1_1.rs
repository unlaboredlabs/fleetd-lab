//! TOML 1.1 syntax, and fixes for TOML 1.0 cases found with toml-test.

use crate::parser::parse;
use serde_json::json;

fn to_json(src: &str) -> serde_json::Value {
    let parse = parse(src);
    assert!(parse.errors.is_empty(), "{:#?}", parse.errors);
    let dom = parse.into_dom();
    if let Err(errors) = dom.validate() {
        panic!("{:#?}", errors.collect::<Vec<_>>());
    }
    serde_json::to_value(&dom).unwrap()
}

fn is_invalid(src: &str) -> bool {
    let parse = parse(src);
    !parse.errors.is_empty() || parse.into_dom().validate().is_err()
}

#[test]
fn escape_and_hex_escapes() {
    assert_eq!(
        to_json(r#"a = "\e[0m \x41\x7f\xFF""#),
        json!({ "a": "\u{1b}[0m A\u{7f}\u{ff}" })
    );
    assert_eq!(
        to_json("a = \"\"\"\\e\\x00\"\"\""),
        json!({ "a": "\u{1b}\u{0}" })
    );

    assert!(is_invalid(r#"a = "\x4""#));
    assert!(is_invalid(r#"a = "\xg0""#));
    assert!(is_invalid(r#"a = "\E""#));
}

#[test]
fn optional_seconds() {
    assert_eq!(
        to_json(
            r#"
t = 13:37
ldt = 1979-05-27T07:32
odt1 = 1979-05-27 07:32Z
odt2 = 1979-05-27t07:32-07:00
"#
        ),
        json!({
            "t": "13:37:00",
            "ldt": "1979-05-27T07:32:00",
            "odt1": "1979-05-27T07:32:00Z",
            "odt2": "1979-05-27T07:32:00-07:00",
        })
    );

    // Fractional seconds require seconds.
    assert!(is_invalid("t = 13:37.5"));
    assert!(is_invalid("t = 13:3"));
}

#[test]
fn date_times_in_arrays() {
    assert_eq!(
        to_json(
            r#"
dates = [
    1987-07-05T17:45:00Z,
    1979-05-27T07:32:00,
    2006-06-01,
    11:00:00,
    1979-05-27 07:32:00.999999999999,
]
"#
        ),
        json!({
            "dates": [
                "1987-07-05T17:45:00Z",
                "1979-05-27T07:32:00",
                "2006-06-01",
                "11:00:00",
                "1979-05-27T07:32:00.999999999",
            ]
        })
    );
}

#[test]
fn invalid_date_times() {
    assert!(is_invalid("d = 2023-02-29"));
    assert!(is_invalid("d = 2006-01-01T00:00:61Z"));
    assert!(is_invalid("d = 2006-01-01T24:00:00"));
    assert!(is_invalid("d = 2006-01-01T00:00:00+24:00"));
    assert!(is_invalid("d = 2006-01-30T"));
    assert!(is_invalid("d = 2020-01-01x"));
    assert!(is_invalid("d = 12:13:14."));
}

#[test]
fn multi_line_inline_tables() {
    assert_eq!(
        to_json(
            r#"
tbl = { # comment
    a = 1, # comment
    # comment
    b.c = [
        1,
        2,
    ],
    d = { e = true, },
}
"#
        ),
        json!({ "tbl": { "a": 1, "b": { "c": [1, 2] }, "d": { "e": true } } })
    );

    assert!(is_invalid("tbl = { a = 1,, }"));
    assert!(is_invalid("tbl = { , }"));
    assert!(is_invalid("tbl = { a\n= 1 }"));
    assert!(is_invalid("tbl = { a =\n1 }"));
}

#[test]
fn non_ascii_in_comments_and_strings() {
    // U+0080..U+009F are allowed, they are non-ASCII.
    assert_eq!(
        to_json("# \u{80}\u{9f} ¡ 🙂\na = '\u{85}'\n'\u{9f}' = \"\u{80}\"\n"),
        json!({ "a": "\u{85}", "\u{9f}": "\u{80}" })
    );

    assert!(is_invalid("# \u{7f}\n"));
    assert!(is_invalid("a = '\u{7f}'"));
    assert!(is_invalid("a = '\u{1b}'"));
}

#[test]
fn carriage_returns_in_multi_line_strings() {
    assert_eq!(
        to_json("a = \"\"\"x\r\ny\"\"\"\r\nb = '''x\r\ny'''\r\n"),
        json!({ "a": "x\r\ny", "b": "x\r\ny" })
    );

    assert!(is_invalid("a = \"\"\"x\ry\"\"\""));
    assert!(is_invalid("a = '''x\ry'''"));
}

#[test]
fn numeric_dotted_keys() {
    assert_eq!(
        to_json("01.23 = true\n1.2e3 = 1"),
        json!({ "01": { "23": true }, "1": { "2e3": 1 } })
    );
    assert!(is_invalid("+1.2 = true"));
    assert!(is_invalid("1e+2 = true"));
}

#[test]
fn implicit_tables_defined_once() {
    assert_eq!(
        to_json("[a.b]\n[a]\nc = 1"),
        json!({ "a": { "b": {}, "c": 1 } })
    );
    assert_eq!(
        to_json("[a.b]\n[a.c]\n[a]"),
        json!({ "a": { "b": {}, "c": {} } })
    );

    assert!(is_invalid("[a.b]\n[a]\n[a]"));
    assert!(is_invalid(
        r#"
[dependencies.foo]
version = "0.16"

[dependencies]
libc = "0.2"

[dependencies]
rand = "0.3.14"
"#
    ));
}
