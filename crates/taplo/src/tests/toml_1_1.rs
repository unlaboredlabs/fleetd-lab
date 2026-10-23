//! Parsing and decoding of TOML 1.1 documents, and fixes found by `toml-test`.

use crate::{dom::Node, parser::parse};

/// Parse a document that must be valid and return the root DOM node.
fn parse_valid(src: &str) -> Node {
    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
    let dom = p.into_dom();
    if let Err(errors) = dom.validate() {
        panic!("{:#?}", errors.collect::<Vec<_>>());
    }
    dom
}

fn is_invalid(src: &str) -> bool {
    let p = parse(src);
    !p.errors.is_empty() || p.into_dom().validate().is_err()
}

/// Get a node by a dot-separated path, numeric segments index into arrays.
fn get(dom: &Node, path: &str) -> Node {
    let mut node = dom.clone();
    for segment in path.split('.') {
        node = match &node {
            Node::Array(_) => node.get(segment.parse::<usize>().unwrap()),
            _ => node.get(segment),
        };
        assert!(!node.is_invalid(), "{path} not found");
    }
    node
}

fn get_str(dom: &Node, path: &str) -> String {
    get(dom, path)
        .as_str()
        .unwrap_or_else(|| panic!("{path} is not a string"))
        .value()
        .to_string()
}

fn get_date(dom: &Node, path: &str) -> String {
    get(dom, path)
        .as_date()
        .unwrap_or_else(|| panic!("{path} is not a date"))
        .value()
        .to_string()
}

#[test]
fn escape_and_hex_escapes() {
    let dom = parse_valid(
        r#"
esc = "\e[0m"
hex = "\x00\x41\xe9\xFF"
ml = """\e\x61"""
"\x61\e" = "key"
"#,
    );

    assert_eq!(get_str(&dom, "esc"), "\u{1B}[0m");
    assert_eq!(get_str(&dom, "hex"), "\u{0}A\u{E9}\u{FF}");
    assert_eq!(get_str(&dom, "ml"), "\u{1B}a");
    assert_eq!(get_str(&dom, "a\u{1B}"), "key");
}

#[test]
fn invalid_hex_escapes() {
    assert!(is_invalid(r#"a = "\x4""#));
    assert!(is_invalid(r#"a = "\xg1""#));
    assert!(is_invalid(r#"a = "\x_1""#));
    // Literal strings have no escapes.
    assert_eq!(get_str(&parse_valid(r#"a = '\x4'"#), "a"), r#"\x4"#);
}

#[test]
fn times_without_seconds() {
    let dom = parse_valid(
        r#"
lt = 13:37
ldt = 1979-05-27T07:32
ldt-space = 1979-05-27 07:32
odt = 1979-05-27 07:32Z
odt-offset = 1979-05-27T07:32-07:00
arr = [07:32, 1979-05-27t07:32z]
"#,
    );

    assert_eq!(get_date(&dom, "lt"), "13:37:00");
    assert_eq!(get_date(&dom, "ldt"), "1979-05-27T07:32:00");
    assert_eq!(get_date(&dom, "ldt-space"), "1979-05-27T07:32:00");
    assert_eq!(get_date(&dom, "odt"), "1979-05-27T07:32:00Z");
    assert_eq!(get_date(&dom, "odt-offset"), "1979-05-27T07:32:00-07:00");
    assert_eq!(get_date(&dom, "arr.0"), "07:32:00");
    assert_eq!(get_date(&dom, "arr.1"), "1979-05-27T07:32:00Z");
}

#[test]
fn date_time_values() {
    let dom = parse_valid(
        r#"
odt = 1979-05-27T00:32:00.999999-07:00
ldt = 1979-05-27T07:32:00.5
lt = 00:32:00.123456789123
d = 2000-02-29
first = 0001-01-01 00:00:00
"#,
    );

    assert_eq!(get_date(&dom, "odt"), "1979-05-27T00:32:00.999999-07:00");
    assert_eq!(get_date(&dom, "ldt"), "1979-05-27T07:32:00.5");
    // Precision beyond nanoseconds is truncated.
    assert_eq!(get_date(&dom, "lt"), "00:32:00.123456789");
    assert_eq!(get_date(&dom, "d"), "2000-02-29");
    assert_eq!(get_date(&dom, "first"), "0001-01-01T00:00:00");
}

#[test]
fn invalid_date_times() {
    // Only `.` is allowed before fractional seconds.
    assert!(is_invalid("a = 07:32:00,5"));
    assert!(is_invalid("a = 1979-05-27T07:32:00,5Z"));
    // Fractional seconds require seconds.
    assert!(is_invalid("a = 07:32.5"));
    assert!(is_invalid("a = 1979-05-27T07"));
    assert!(is_invalid("a = 1979-05-27T07:32:00+24:00"));
    assert!(is_invalid("a = 1979-05-27T07:"));
}

#[test]
fn non_ascii_characters() {
    let dom = parse_valid(
        "# ~ \u{80} \u{9F} \u{FF} \u{D7FF} \u{E000} \u{FFFF} \u{10000} \u{10FFFF}\n\
         basic = \"\u{80} é \u{10FFFF}\"\n\
         literal = '\u{80} é \u{10FFFF}'\n\
         ml = '''\u{9F}\n\u{85}'''\n\
         'l \u{80}' = 1\n",
    );

    assert_eq!(get_str(&dom, "basic"), "\u{80} é \u{10FFFF}");
    assert_eq!(get_str(&dom, "literal"), "\u{80} é \u{10FFFF}");
    assert_eq!(get_str(&dom, "ml"), "\u{9F}\n\u{85}");
}

#[test]
fn control_characters() {
    assert!(is_invalid("# \u{7F}\n"));
    assert!(is_invalid("a = '\u{1}'"));
    assert!(is_invalid("a = \"\u{7F}\""));
    assert!(is_invalid("a = '''\u{0}'''"));
    // A lone CR is not a newline.
    assert!(is_invalid("a = \"\"\"null\r\"\"\""));
    assert!(is_invalid("a = '''null\r'''"));
    assert!(is_invalid("a = '''a\rb'''"));

    let dom = parse_valid("a = \"\"\"x\r\ny\"\"\"\nb = '''x\r\ny'''\n");
    assert_eq!(get_str(&dom, "a"), "x\r\ny");
    assert_eq!(get_str(&dom, "b"), "x\r\ny");
}

#[test]
fn invalid_character_error_offsets() {
    let src = "a = \"éé\u{1}\" # é\u{7F}\n";
    let errors = parse(src).errors;

    let string_error = src.find('\u{1}').unwrap() as u32;
    let comment_error = src.find('\u{7F}').unwrap() as u32;

    assert_eq!(errors.len(), 2, "{errors:#?}");
    assert_eq!(u32::from(errors[0].range.start()), string_error);
    assert_eq!(u32::from(errors[1].range.start()), comment_error);
}

#[test]
fn numeric_dotted_keys() {
    let dom = parse_valid("01.23 = true\n1.2e3 = 1\n-1.5 = 2\n");

    let keys = dom
        .flat_iter()
        .map(|(keys, _)| keys.dotted().to_string())
        .collect::<Vec<_>>();

    assert!(keys.contains(&"01.23".to_string()), "{keys:?}");
    assert!(keys.contains(&"1.2e3".to_string()), "{keys:?}");
    assert!(keys.contains(&"-1.5".to_string()), "{keys:?}");
    assert!(is_invalid("1.2e+3 = 1"));
    assert!(is_invalid("+1.5 = 1"));
}

#[test]
fn multi_line_inline_tables() {
    let dom = parse_valid(
        r#"
tbl = { # comment
    key      = "a string", # comment
    # comment
    moar-tbl =  {
        key = 1,
    },

    arr = [
      1, # one
    ]
    , dotted.key = true,
}
trailing = { a = 1, }
"#,
    );

    assert_eq!(get_str(&dom, "tbl.key"), "a string");
    assert!(get(&dom, "tbl.moar-tbl.key").is_integer());
    assert!(get(&dom, "tbl.arr.0").is_integer());
    assert!(get(&dom, "tbl.dotted.key").is_bool());
    assert!(get(&dom, "trailing.a").is_integer());
}

#[test]
fn invalid_inline_tables() {
    assert!(is_invalid("a = { b = 1,, }"));
    assert!(is_invalid("a = { , }"));
    assert!(is_invalid("a = { b = 1\n c = 2 }"));
    assert!(is_invalid("a = { b\n= 1 }"));
    assert!(is_invalid("a = { b = 1 }\na.c = 2"));
}

#[test]
fn table_redefinition() {
    parse_valid("[a.b]\n[a]\n");
    parse_valid("[a.b]\n[a]\nc = 1\n[a.d]\n");
    assert!(is_invalid("[a.b]\n[a]\n[a]\n"));
    assert!(is_invalid(
        "[dependencies.foo]\nversion = \"0.16\"\n\n[dependencies]\nlibc = \"0.2\"\n\n[dependencies]\nrand = \"0.3.14\"\n"
    ));
    assert!(is_invalid("[a]\n[a]\n"));
    assert!(is_invalid("a.b = 1\n[a]\n"));
}

#[test]
fn integer_range() {
    parse_valid("a = 9223372036854775807\nb = -9223372036854775808\nc = 0xFFFF_FFFF_FFFF_FFFF");
    assert!(is_invalid("a = -9223372036854775809"));
    assert!(is_invalid("a = 99999999999999999999"));
    assert!(is_invalid("a = 0x1_0000_0000_0000_0000"));
    assert!(is_invalid(
        "a = 0b1_0000000000000000000000000000000000000000000000000000000000000000"
    ));
}
