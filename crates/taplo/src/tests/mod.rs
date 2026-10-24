use crate::parser::parse;

mod generated {
    mod invalid;
}

mod formatter;

#[test]
fn time_in_arrays() {
    let src = r#"
    a = [00:00:01, 02:03:04]
    "#;

    let errors = parse(src).errors;

    assert!(errors.is_empty(), "{:#?}", errors);
}

#[test]
fn comments_after_tables() {
    let src = r#"
[[array]] # foo
[table] # foo
"#;
    let errors = parse(src).errors;

    assert!(errors.is_empty(), "{:#?}", errors);
}

#[test]
fn dates_in_table_keys() {
    let src = r#"
[2024-01-01]
2024-01-01 = true

[[2024-01-02]]
2024-01-01 = true
"#;
    let errors = parse(src).errors;

    assert!(errors.is_empty(), "{:#?}", errors);
}

#[test]
fn inline_table_with_linebreaks_and_trailing_comma() {
    let src = r#"
cooldowns = { 
    foo = "foo",
    bar = "bar",
}
"#;
    let errors = parse(src).errors;

    assert!(errors.is_empty(), "{:#?}", errors);
}

#[test]
fn get_matches_table_key() {
    let src = r#"
name1 = "v"
other = "v2"
"#;

    let root = parse(src).into_dom();

    let matched: Vec<String> = root
        .get_matches("na*")
        .unwrap()
        .map(|(k, _)| match k {
            crate::dom::KeyOrIndex::Key(key) => key.value().to_string(),
            crate::dom::KeyOrIndex::Index(idx) => idx.to_string(),
        })
        .collect();

    assert_eq!(matched, vec!["name1"]);
}

#[test]
fn datetime_with_leading_zeros() {
    let src = r#"
token_expires_at = 0001-01-01T00:00:00Z
"#;

    let errors = parse(src).errors;

    assert!(errors.is_empty(), "{:#?}", errors);
}

fn parse_valid(src: &str) -> crate::dom::Node {
    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
    let dom = p.into_dom();
    if let Err(errors) = dom.validate() {
        panic!("{:#?}", errors.collect::<Vec<_>>());
    }
    dom
}

fn assert_invalid(src: &str) {
    let p = parse(src);
    assert!(
        !p.errors.is_empty() || p.into_dom().validate().is_err(),
        "expected an error for {src:?}"
    );
}

fn str_value(dom: &crate::dom::Node, key: &str) -> String {
    dom.get(key).as_str().unwrap().value().to_string()
}

fn date_value(dom: &crate::dom::Node, key: &str) -> String {
    match dom.get(key) {
        crate::dom::Node::Date(d) => d.value().to_string(),
        node => panic!("{key} is not a date: {node:?}"),
    }
}

#[test]
fn toml_1_1_escapes() {
    let dom = parse_valid(
        r#"
esc = "\e[0m"
hex = "\x41\xe9\x00"
multi = """\e\x7F"""
"#,
    );

    assert_eq!(str_value(&dom, "esc"), "\u{1b}[0m");
    assert_eq!(str_value(&dom, "hex"), "A\u{e9}\u{0}");
    assert_eq!(str_value(&dom, "multi"), "\u{1b}\u{7f}");

    assert_invalid(r#"a = "\x4""#);
    assert_invalid(r#"a = "\xG0""#);
    assert_invalid(r#"a = "\u00e""#);
    assert_invalid(r#"a = "\  x""#);
    assert_invalid("a = \"\"\"\nfoo \\   \"\"\"");
}

#[test]
fn line_ending_backslash_trims_whitespace() {
    let dom = parse_valid("a = \"\"\"\nfoo \\  \n\n   \t bar \\\r\n  baz\"\"\"\n");

    assert_eq!(str_value(&dom, "a"), "foo bar baz");
}

#[test]
fn escape_control_characters() {
    assert_eq!(
        crate::util::escape("\u{1b}\u{0}\u{7f}\t"),
        r#"\u001B\u0000\u007F\t"#
    );
}

#[test]
fn optional_seconds() {
    let dom = parse_valid(
        r#"
t = 13:37
ldt = 1979-05-27T07:32
odt1 = 1979-05-27 07:32Z
odt2 = 1979-05-27 07:32-07:00
arr = [13:37, 1979-05-27T07:32, 1979-05-27 07:32Z]
"#,
    );

    assert_eq!(date_value(&dom, "t"), "13:37:00");
    assert_eq!(date_value(&dom, "ldt"), "1979-05-27T07:32:00");
    assert_eq!(date_value(&dom, "odt1"), "1979-05-27T07:32:00Z");
    assert_eq!(date_value(&dom, "odt2"), "1979-05-27T07:32:00-07:00");
    assert_eq!(dom.get("arr").as_array().unwrap().items().read().len(), 3);

    assert_invalid("t = 13:37:");
    assert_invalid("t = 13:37.5");
    assert_invalid("t = 1979-05-27T07:32.5Z");
}

#[test]
fn datetime_values() {
    let dom = parse_valid(
        r#"
odt = 1979-05-27T00:32:00.5-07:00
utc = 1979-05-27t07:32:00z
ldt = 1979-05-27 07:32:00.999
dates = [1987-07-05T17:45:00Z, 1979-05-27T07:32:00, 2006-06-01, 11:00:00]
"#,
    );

    assert_eq!(date_value(&dom, "odt"), "1979-05-27T00:32:00.5-07:00");
    assert_eq!(date_value(&dom, "utc"), "1979-05-27T07:32:00Z");
    assert_eq!(date_value(&dom, "ldt"), "1979-05-27T07:32:00.999");

    let dates = dom.get("dates");
    let dates = dates.as_array().unwrap().items().read();
    let dates: Vec<_> = dates
        .iter()
        .map(|d| d.as_date().unwrap().value().to_string())
        .collect();
    assert_eq!(
        dates,
        [
            "1987-07-05T17:45:00Z",
            "1979-05-27T07:32:00",
            "2006-06-01",
            "11:00:00"
        ]
    );

    // A comma is not a valid decimal separator for fractional seconds.
    assert_invalid("t = 1979-05-27T07:32:00,5");
}

#[test]
fn non_ascii_in_comments_and_strings() {
    let dom = parse_valid(
        "# \u{80} \u{9f} \u{ff} \u{d7ff} \u{e000} \u{ffff} \u{10000} \u{10ffff}\n\
         basic = \"\u{80} \u{9f}\"\n\
         literal = '\u{80} \u{9f}'\n\
         '\u{85}' = 1 # \u{85}\n",
    );

    assert_eq!(str_value(&dom, "basic"), "\u{80} \u{9f}");
    assert_eq!(str_value(&dom, "literal"), "\u{80} \u{9f}");
    assert!(dom.get("\u{85}").as_integer().is_some());
}

#[test]
fn control_characters() {
    assert_invalid("# \u{7f}\n");
    assert_invalid("a = '\u{7f}'");
    assert_invalid("a = '''\u{7f}'''");
    assert_invalid("a = \"\"\"null\r\"\"\"");
    assert_invalid("a = '''null\r'''");
    assert_invalid("a = \"null\r\"");
    assert_invalid("a = 1 # foo\rbar\n");

    let dom = parse_valid("a = \"\"\"foo\r\nbar\"\"\"\r\nb = '''foo\r\nbar'''\r\n");
    assert_eq!(str_value(&dom, "a"), "foo\r\nbar");
    assert_eq!(str_value(&dom, "b"), "foo\r\nbar");
}

#[test]
fn numeric_keys() {
    let dom = parse_valid("01.23 = true\n1e3 = 1\n-1.5 = 2\n");

    assert!(dom.get("01").get("23").as_bool().is_some());
    assert!(dom.get("1e3").as_integer().is_some());
    assert!(dom.get("-1").get("5").as_integer().is_some());

    assert_invalid("1.2e+3 = 1");
}

#[test]
fn super_table_defined_twice() {
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

    let dom = parse_valid("[a.b]\nx = 1\n[a]\ny = 2\n[a.c]\nz = 3\n");
    assert!(dom.get("a").get("b").get("x").as_integer().is_some());
    assert!(dom.get("a").get("y").as_integer().is_some());
    assert!(dom.get("a").get("c").get("z").as_integer().is_some());
}

#[test]
fn multi_line_inline_table() {
    let src = r#"
tbl = { # start
    a = 1, # one

    # standalone
    b = { c = 2, },
}
"#;
    let dom = parse_valid(src);
    assert!(dom.get("tbl").get("a").as_integer().is_some());
    assert!(dom.get("tbl").get("b").get("c").as_integer().is_some());

    // Newlines and comments are tokens directly inside the inline table node.
    let syntax = parse(src).into_syntax();
    let table = syntax
        .descendants()
        .find(|n| n.kind() == crate::syntax::SyntaxKind::INLINE_TABLE)
        .unwrap();
    let kinds: Vec<_> = table
        .children_with_tokens()
        .map(|c| c.kind())
        .filter(|k| *k != crate::syntax::SyntaxKind::WHITESPACE)
        .collect();

    use crate::syntax::SyntaxKind::*;
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
fn to_toml_inline_tables() {
    let src = r#"
a.b = 1
point = {
    x = 1, # the x coordinate
    y = { z = 07:32 },
}

[tbl]
inline = { a = 1, b = "\e[0m", }
c = 2
"#;
    let toml = parse_valid(src).to_toml(false, false);

    // Inline tables are entries of their table, not headers.
    assert_eq!(
        toml,
        r#"point = { x = 1, y = { z = 07:32 } }
[a]
b = 1
[tbl]
inline = { a = 1, b = "\e[0m" }
c = 2
"#
    );
    assert_eq!(
        serde_json::to_value(parse_valid(&toml)).unwrap(),
        serde_json::to_value(parse_valid(src)).unwrap()
    );
}
