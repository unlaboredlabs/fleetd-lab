//! Parsing and decoding of TOML 1.1 documents,
//! and other spec conformance fixes found by toml-test.

use crate::{
    dom::{
        node::{DateTimeValue, Key},
        Node,
    },
    parser::parse,
};

fn assert_valid(src: &str) -> Node {
    let p = parse(src);
    assert!(p.errors.is_empty(), "{src:?}: {:#?}", p.errors);
    let dom = p.into_dom();
    if let Err(errors) = dom.validate() {
        panic!("{src:?}: {:#?}", errors.collect::<Vec<_>>());
    }
    dom
}

fn assert_invalid(src: &str) {
    let p = parse(src);
    if !p.errors.is_empty() {
        return;
    }
    assert!(
        p.into_dom().validate().is_err(),
        "{src:?} should be invalid"
    );
}

fn str_value(dom: &Node, key: &str) -> String {
    dom.get(key).as_str().unwrap().value().to_string()
}

fn date_value(dom: &Node, key: &str) -> DateTimeValue {
    dom.get(key).as_date().unwrap().value()
}

#[test]
fn escape_sequences() {
    let dom = assert_valid(
        r#"
esc = "\e[0m"
hex = "\x41\x6a\xE9\x00"
multi = """\e\x7f"""
literal = '\e\x41'
"#,
    );

    assert_eq!(str_value(&dom, "esc"), "\u{1b}[0m");
    assert_eq!(str_value(&dom, "hex"), "Aj\u{e9}\u{0}");
    assert_eq!(str_value(&dom, "multi"), "\u{1b}\u{7f}");
    assert_eq!(str_value(&dom, "literal"), r"\e\x41");
}

#[test]
fn invalid_escape_sequences() {
    assert_invalid(r#"a = "\x4""#);
    assert_invalid(r#"a = "\xG1""#);
    assert_invalid(r#"a = "\x""#);
    assert_invalid(r#"a = "\u00_1""#);
    assert_invalid(r#"a = "\uD800""#);
    assert_invalid(r#"a = "\E""#);
    assert_invalid(r#"a = "\ ""#);
    assert_invalid("a = \"\"\"a \\  b\"\"\"");
}

#[test]
fn line_ending_backslash() {
    let dom = assert_valid("a = \"\"\"\nfoo \\\n   \n\t  bar \\  \r\n  baz\"\"\"\n");
    assert_eq!(str_value(&dom, "a"), "foo bar baz");
}

#[test]
fn escaped_backslash_before_closing_quotes() {
    let dom = assert_valid("a = \"\"\"a\\\\\"\"\"\nb = \"\"\"\\\"\"\"\"\"\n");
    assert_eq!(str_value(&dom, "a"), "a\\");
    assert_eq!(str_value(&dom, "b"), "\"\"");
}

#[test]
fn times_without_seconds() {
    let dom = assert_valid(
        r#"
lt = 13:37
ldt = 1979-05-27T07:32
ldt-space = 1979-05-27 07:32
odt = 1979-05-27 07:32Z
odt-offset = 1979-05-27T07:32-07:00
"#,
    );

    assert_eq!(date_value(&dom, "lt").to_string(), "13:37:00");
    assert_eq!(date_value(&dom, "ldt").to_string(), "1979-05-27T07:32:00");
    assert_eq!(
        date_value(&dom, "ldt-space").to_string(),
        "1979-05-27T07:32:00"
    );
    assert_eq!(date_value(&dom, "odt").to_string(), "1979-05-27T07:32:00Z");
    assert_eq!(
        date_value(&dom, "odt-offset").to_string(),
        "1979-05-27T07:32:00-07:00"
    );
}

#[test]
fn date_time_values() {
    let dom = assert_valid(
        r#"
odt = 1979-05-27t07:32:00.999999z
ldt = 1979-05-27T00:32:00.5
ld = 2000-02-29
lt = 00:32:00.123456789123
"#,
    );

    assert_eq!(
        date_value(&dom, "odt").to_string(),
        "1979-05-27T07:32:00.999999Z"
    );
    assert_eq!(date_value(&dom, "ldt").to_string(), "1979-05-27T00:32:00.5");
    assert_eq!(date_value(&dom, "ld").to_string(), "2000-02-29");
    assert_eq!(date_value(&dom, "lt").to_string(), "00:32:00.123456789");

    // Local date-times in arrays.
    let dom = assert_valid("a = [1979-05-27T07:32:00, 1979-05-27T07:32]");
    let items = dom.get("a").as_array().unwrap().items().read().clone();
    for item in items.iter() {
        assert!(matches!(
            item.as_date().unwrap().value(),
            DateTimeValue::LocalDateTime(_)
        ));
    }
}

#[test]
fn invalid_date_times() {
    assert_invalid("a = 1979-02-29");
    assert_invalid("a = 1979-13-01");
    assert_invalid("a = 1979-00-01");
    assert_invalid("a = 1979-04-31");
    assert_invalid("a = 24:00");
    assert_invalid("a = 23:60");
    assert_invalid("a = 23:59:61");
    assert_invalid("a = 07:32.5");
    assert_invalid("a = 07:32:");
    assert_invalid("a = 1979-05-27T07:32:00,5");
    assert_invalid("a = 1979-05-27T07:32:00+24:00");
    assert_invalid("a = 1979-05-27T07:32:00-07:60");
}

#[test]
fn non_ascii_characters() {
    let dom = assert_valid(
        "# \u{80} \u{9f} \u{a0} \u{ffff} \u{10ffff}\nlit = '\u{80}\u{9f}'\nml = '''\u{85}'''\n",
    );
    assert_eq!(str_value(&dom, "lit"), "\u{80}\u{9f}");
}

#[test]
fn control_characters() {
    assert_invalid("# \u{7f}\n");
    assert_invalid("# \u{0}\n");
    assert_invalid("a = '\u{7f}'");
    assert_invalid("a = \"\u{1f}\"");
    assert_invalid("a = \"\"\"a\rb\"\"\"");
    assert_invalid("a = '''a\rb'''");

    let dom = assert_valid("a = \"\"\"a\r\nb\"\"\"\nb = '''a\tb'''\n");
    assert_eq!(str_value(&dom, "a"), "a\r\nb");
}

#[test]
fn multi_line_inline_tables() {
    let dom = assert_valid(
        r#"
server = { # comment
  host = "localhost", # where it listens

  # own line
  port = 8080
  , tls = {
    cert = "a.pem",
  },
}
empty = {
}
trailing-comma = { a = 1, }
"#,
    );

    let server = dom.get("server");
    assert_eq!(str_value(&server, "host"), "localhost");
    assert_eq!(str_value(&server.get("tls"), "cert"), "a.pem");
    assert!(dom
        .get("empty")
        .as_table()
        .unwrap()
        .entries()
        .read()
        .is_empty());
    assert_eq!(
        dom.get("trailing-comma")
            .as_table()
            .unwrap()
            .entries()
            .read()
            .len(),
        1
    );
}

#[test]
fn invalid_inline_tables() {
    assert_invalid("a = { , }");
    assert_invalid("a = { , b = 1 }");
    assert_invalid("a = { b = 1,, }");
    assert_invalid("a = { b = 1 c = 2 }");
    assert_invalid("a = { b\n= 1 }");
    assert_invalid("a = { b =\n1 }");
    assert_invalid("a = { b.\nc = 1 }");
    assert_invalid("a = { b = 1");
    assert_invalid("a = { b = 1 # comment }");
}

#[test]
fn numeric_dotted_keys() {
    let dom = assert_valid("01.23 = true\n1.2 = false\n");
    assert!(dom.get("01").get("23").as_bool().unwrap().value());
    assert!(!dom.get("1").get("2").as_bool().unwrap().value());

    assert_invalid("+1.2 = true");
}

#[test]
fn table_defined_twice_after_super_table() {
    assert_valid("[a.b]\n[a]\n[a.c]\n");
    assert_invalid("[a.b]\n[a]\n[a]\n");
    assert_invalid("[a.b.c]\n[a.b]\n[a]\n[a.b]\n");
    assert_invalid("[a.b]\nx = 1\n[a]\ny = 2\n[a]\nz = 3\n");
}

#[test]
fn key_display_quoting() {
    assert_eq!(Key::new("bare-key_1").to_string(), "bare-key_1");
    assert_eq!(Key::new("a b").to_string(), "'a b'");
    assert_eq!(Key::new("a.b").to_string(), "'a.b'");
    assert_eq!(Key::new("").to_string(), "''");
    assert_eq!(Key::new("it's").to_string(), r#""it's""#);
    assert_eq!(
        Key::new("tab\tnew\nline").to_string(),
        r#""tab\tnew\nline""#
    );
}
