//! Tests for TOML 1.1 features and for spec conformance fixes
//! found with toml-test.

use crate::{
    dom::node::{DateTimeValue, Node},
    formatter,
    parser::parse,
    syntax::SyntaxKind::{self, *},
};

fn assert_valid(src: &str) -> Node {
    let parse = parse(src);
    assert!(parse.errors.is_empty(), "{:#?}", parse.errors);
    let dom = parse.into_dom();
    if let Err(errors) = dom.validate() {
        panic!("{:#?}", errors.collect::<Vec<_>>());
    }
    dom
}

fn assert_invalid(src: &str) {
    let parse = parse(src);
    assert!(
        !parse.errors.is_empty() || parse.into_dom().validate().is_err(),
        "expected invalid TOML: {src:?}"
    );
}

fn str_value(dom: &Node, key: &str) -> String {
    dom.get(key).as_str().unwrap().value().to_string()
}

fn date_value(dom: &Node, key: &str) -> DateTimeValue {
    dom.get(key).as_date().unwrap().value()
}

#[test]
fn inline_table_newlines_comments_trailing_comma() {
    let src = r#"tbl = { # start
    a = 1, # after a

    # own line
    b = { c = 2, }, d = [1,
        2],
}
"#;
    let dom = assert_valid(src);

    assert_eq!(
        dom.get("tbl").get("a").as_integer().unwrap().value(),
        crate::dom::node::IntegerValue::Positive(1)
    );
    assert_eq!(
        dom.get("tbl")
            .get("b")
            .get("c")
            .as_integer()
            .unwrap()
            .value(),
        crate::dom::node::IntegerValue::Positive(2)
    );
    assert_eq!(
        dom.get("tbl")
            .get("d")
            .as_array()
            .unwrap()
            .items()
            .read()
            .len(),
        2
    );
}

#[test]
fn inline_table_syntax_is_lossless() {
    let src = "tbl = { # start\n    a = 1, # after a\n\n    b = 2,\n}\n";
    let syntax = parse(src).into_syntax();

    assert_eq!(syntax.to_string(), src);

    let table = syntax
        .descendants()
        .find(|n| n.kind() == INLINE_TABLE)
        .unwrap();

    let kinds: Vec<SyntaxKind> = table
        .children_with_tokens()
        .map(|c| c.kind())
        .filter(|k| *k != WHITESPACE)
        .collect();

    assert_eq!(
        kinds,
        [
            BRACE_START,
            COMMENT,
            NEWLINE,
            ENTRY,
            COMMA,
            COMMENT,
            NEWLINE,
            ENTRY,
            COMMA,
            NEWLINE,
            BRACE_END
        ]
    );
}

#[test]
fn inline_table_invalid_commas() {
    assert_invalid("tbl = { , }\n");
    assert_invalid("tbl = { a = 1,, }\n");
    assert_invalid("tbl = { a = 1\n b = 2 }\n");
    assert_invalid("tbl = { a = 1, \n");
}

#[test]
fn escape_sequences() {
    let dom = assert_valid(
        r#"
esc = "\e[0m"
hex = "\x41\x7f\xe9\x00"
ml = """\x41\e"""
"#,
    );

    assert_eq!(str_value(&dom, "esc"), "\u{1b}[0m");
    assert_eq!(str_value(&dom, "hex"), "A\u{7f}\u{e9}\u{0}");
    assert_eq!(str_value(&dom, "ml"), "A\u{1b}");

    assert_invalid(r#"a = "\x4""#);
    assert_invalid(r#"a = "\xGG""#);
    assert_invalid(r#"a = "\X41""#);
    assert_invalid(r#"a = "\E""#);
}

#[test]
fn optional_seconds() {
    let dom = assert_valid(
        r#"
odt = 1979-05-27 07:32Z
odt-offset = 1979-05-27T07:32-07:00
ldt = 1979-05-27T07:32
lt = 13:37
"#,
    );

    assert_eq!(date_value(&dom, "odt").to_string(), "1979-05-27T07:32:00Z");
    assert_eq!(
        date_value(&dom, "odt-offset").to_string(),
        "1979-05-27T07:32:00-07:00"
    );
    assert_eq!(date_value(&dom, "ldt").to_string(), "1979-05-27T07:32:00");
    assert_eq!(date_value(&dom, "lt").to_string(), "13:37:00");

    assert_invalid("a = 13:37:\n");
    assert_invalid("a = 13:37.5\n");
    assert_invalid("a = 1979-05-27T07:32.5Z\n");
}

#[test]
fn date_time_values() {
    let dom = assert_valid(
        r#"
odt = 1979-05-27t07:32:00.5z
max-offset = 1979-05-27T07:32:00+23:59
nanos = 1979-05-27T07:32:00.1234567891Z
ldt = 1979-05-27 07:32:00.999
ld = 1979-05-27
lt = 00:32:00.5
arr = [1979-05-27T07:32:00,1979-05-27T07:32:00.5,07:32:00,07:32]
"#,
    );

    assert!(matches!(
        date_value(&dom, "odt"),
        DateTimeValue::OffsetDateTime(_)
    ));
    assert_eq!(
        date_value(&dom, "odt").to_string(),
        "1979-05-27T07:32:00.5Z"
    );
    assert_eq!(
        date_value(&dom, "max-offset").to_string(),
        "1979-05-27T07:32:00+23:59"
    );
    assert_eq!(
        date_value(&dom, "nanos").to_string(),
        "1979-05-27T07:32:00.123456789Z"
    );
    assert!(matches!(
        date_value(&dom, "ldt"),
        DateTimeValue::LocalDateTime(_)
    ));
    assert_eq!(
        date_value(&dom, "ldt").to_string(),
        "1979-05-27T07:32:00.999"
    );
    assert!(matches!(date_value(&dom, "ld"), DateTimeValue::Date(_)));
    assert_eq!(date_value(&dom, "lt").to_string(), "00:32:00.5");

    let arr: Vec<String> = dom
        .get("arr")
        .as_array()
        .unwrap()
        .items()
        .read()
        .iter()
        .map(|n| n.as_date().unwrap().value().to_string())
        .collect();
    assert_eq!(
        arr,
        [
            "1979-05-27T07:32:00",
            "1979-05-27T07:32:00.5",
            "07:32:00",
            "07:32:00"
        ]
    );

    // Only "." is a valid decimal separator.
    assert_invalid("a = 07:32:00,5\n");
}

#[test]
fn non_ascii_in_comments_and_strings() {
    let dom = assert_valid(
        "# \u{80} \u{85} \u{9f} \u{a0} \u{d7ff} \u{e000} \u{10ffff}\n\
         basic = \"\u{80} \u{9f}\"\n\
         literal = '\u{80} \u{9f}'\n\
         ml-basic = \"\"\"\u{85}\"\"\"\n\
         ml-literal = '''\u{85}'''\n\
         \"\u{85}\" = 1\n\
         '\u{9f}' = 2\n",
    );

    assert_eq!(str_value(&dom, "literal"), "\u{80} \u{9f}");
    assert!(dom.get("\u{85}").is_integer());
    assert!(dom.get("\u{9f}").is_integer());
}

#[test]
fn bare_cr_in_multi_line_strings() {
    assert_invalid("a = \"\"\"null\r\"\"\"\n");
    assert_invalid("a = '''null\r'''\n");
    assert_invalid("a = \"\"\"\\\r\n\"\"\"\n".replace("\r\n", "\r ").as_str());

    let dom = assert_valid("a = \"\"\"x\r\ny\"\"\"\nb = '''x\r\ny'''\n");
    assert_eq!(str_value(&dom, "a"), "x\r\ny");
    assert_eq!(str_value(&dom, "b"), "x\r\ny");
}

#[test]
fn control_characters_still_invalid() {
    assert_invalid("# \u{7f}\n");
    assert_invalid("# \u{0}\n");
    assert_invalid("a = \"\u{1b}\"\n");
    assert_invalid("a = '\u{7f}'\n");
    assert_invalid("a = '''\u{1f}'''\n");
}

#[test]
fn numeric_dotted_keys() {
    let dom = assert_valid("01.23 = true\n1.2 = 3\n");

    assert!(dom.get("01").get("23").is_bool());
    assert!(dom.get("1").get("2").is_integer());

    assert_invalid("+1.2 = true\n");
    assert_invalid("1.2e+3 = true\n");
}

#[test]
fn table_defined_twice_via_super_table() {
    assert_invalid("[a.b]\n[a]\n[a]\n");
    assert_invalid(
        r#"
[dependencies.foo]
version = "0.16"

[dependencies]
libc = "0.2"

[dependencies]
rand = "0.3.14"
"#,
    );

    // Defining a super-table once after its sub-table is fine.
    assert_valid("[a.b]\n[a]\nc = 1\n[a.d]\n");
    assert_valid("[[a.b]]\n[a]\nc = 1\n");
}

#[test]
fn integer_out_of_range() {
    assert_valid("a = -9223372036854775808\nb = 9223372036854775807\nc = 0x7fffffffffffffff\n");

    assert_invalid("a = -9223372036854775809\n");
    assert_invalid("a = 18446744073709551616\n");
    assert_invalid("a = 0x1_0000_0000_0000_0000\n");
}

#[test]
fn format_inline_table_with_comments() {
    let src = r#"tbl = { # start
    a = 1, # after a
    # own line
    b = 2, # after b
}
"#;

    let formatted = formatter::format(src, Default::default());

    // Multi-line inline tables are laid out like multi-line arrays,
    // and the comments are preserved.
    let expected = r#"tbl = { # start
  a = 1, # after a
  # own line
  b = 2, # after b
}
"#;
    assert_eq!(formatted, expected);
    assert_eq!(formatter::format(&formatted, Default::default()), formatted);
}

#[test]
fn format_inline_table_nested_comments() {
    let src = r#"a = { b = 1, c = { d = 2 # d
} }
"#;

    let formatted = formatter::format(src, Default::default());

    // The outer table is single-line, only the inner one is multi-line.
    let expected = r#"a = { b = 1, c = {
  d = 2, # d
} }
"#;
    assert_eq!(formatted, expected);
}
