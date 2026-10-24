use crate::{dom::node::DateTimeValue, parser::parse, syntax::SyntaxKind};

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

#[test]
fn toml_1_1_escapes() {
    let src = r#"
esc = "\e[0m"
hex = "\x00\x41\xe6\xFF"
multi = """\x41\e"""
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    let dom = p.into_dom();
    assert!(dom.validate().is_ok());
    assert_eq!(dom.get("esc").as_str().unwrap().value(), "\u{1b}[0m");
    assert_eq!(
        dom.get("hex").as_str().unwrap().value(),
        "\u{0}A\u{e6}\u{ff}"
    );
    assert_eq!(dom.get("multi").as_str().unwrap().value(), "A\u{1b}");
}

#[test]
fn invalid_escapes() {
    for src in [
        r#"a = "\x4""#,
        r#"a = "\xZZ""#,
        r#"a = "\E""#,
        r#"a = "bad \  escape""#,
        "a = \"\"\"\nbad \\   \"\"\"",
    ] {
        assert!(!parse(src).errors.is_empty(), "{src}");
    }
}

#[test]
fn optional_seconds_in_date_times() {
    let src = r#"
lt = 07:32
ldt = 1979-05-27T07:32
odt1 = 1979-05-27 07:32Z
odt2 = 1979-05-27 07:32-07:00
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    let dom = p.into_dom();
    let value = |key: &str| dom.get(key).as_date().unwrap().value().to_string();
    assert_eq!(value("lt"), "07:32:00");
    assert_eq!(value("ldt"), "1979-05-27T07:32:00");
    assert_eq!(value("odt1"), "1979-05-27T07:32:00Z");
    assert_eq!(value("odt2"), "1979-05-27T07:32:00-07:00");
}

#[test]
fn date_time_kinds_and_values() {
    let src = r#"
dates = [
    1987-07-05T17:45:00Z,
    1979-05-27T07:32:00,
    2006-06-01,
    11:00:00,
]
lower = 1987-07-05t17:45:00z
nanos = 1987-07-05T17:45:56.1234567891+08:00
time = 10:32:00.555
leap = 2000-02-29
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    let dom = p.into_dom();
    let dates = dom.get("dates");
    let dates = dates.as_array().unwrap().items().read();
    let date = |idx: usize| dates[idx].as_date().unwrap().value();
    assert!(matches!(date(0), DateTimeValue::OffsetDateTime(_)));
    assert!(matches!(date(1), DateTimeValue::LocalDateTime(_)));
    assert!(matches!(date(2), DateTimeValue::Date(_)));
    assert!(matches!(date(3), DateTimeValue::Time(_)));
    assert_eq!(date(1).to_string(), "1979-05-27T07:32:00");

    let value = |key: &str| dom.get(key).as_date().unwrap().value().to_string();
    assert_eq!(value("lower"), "1987-07-05T17:45:00Z");
    assert_eq!(value("nanos"), "1987-07-05T17:45:56.123456789+08:00");
    assert_eq!(value("time"), "10:32:00.555");
    assert_eq!(value("leap"), "2000-02-29");
}

#[test]
fn invalid_date_times() {
    for src in [
        "a = 2001-02-29",
        "a = 2006-01-32",
        "a = 2006-13-01",
        "a = 2006-00-01",
        "a = 24:00:00",
        "a = 23:60:00",
        "a = 23:59:61",
        "a = 2006-01-01T00:00:00+24:00",
        "a = 2006-01-01T",
        "a = 2006-01-01x",
        "a = 12:13:14.",
        "a = 1987-07-0517:45:00Z",
        "a = 10000-01-01",
    ] {
        assert!(!parse(src).errors.is_empty(), "{src}");
    }
}

#[test]
fn date_like_keys() {
    let src = r#"
2000-02-30 = 1
2000-01-01abc = 2
2000-01-01T07 = 3
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    let dom = p.into_dom();
    assert!(dom.validate().is_ok());
    assert!(dom.get("2000-02-30").as_integer().is_some());
    assert!(dom.get("2000-01-01abc").as_integer().is_some());
    assert!(dom.get("2000-01-01T07").as_integer().is_some());
}

#[test]
fn numeric_dotted_keys() {
    let src = r#"
01.23 = true
-1.5e3 = true
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    let dom = p.into_dom();
    assert!(dom.get("01").get("23").as_bool().is_some());
    assert!(dom.get("-1").get("5e3").as_bool().is_some());

    assert!(!parse("+1.2 = true").errors.is_empty());
}

#[test]
fn non_ascii_in_comments_and_strings() {
    let src = "# ~ \u{80} \u{9f} \u{ff} \u{d7ff} \u{e000} \u{10ffff}
a = \"\u{80}\u{9f}\"
b = '\u{80}\u{9f}'
c = \"\"\"\u{80}\"\"\"
d = '''\u{80}'''
";

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
}

#[test]
fn control_characters() {
    for src in [
        "# \u{7f}",
        "# \u{0}",
        "a = \"\u{1f}\"",
        "a = '\u{7f}'",
        "a = \"\"\"a\rb\"\"\"",
        "a = '''a\rb'''",
        "a = 1 # \r",
    ] {
        assert!(!parse(src).errors.is_empty(), "{src:?}");
    }

    let p = parse("a = \"\"\"a\r\nb\"\"\"\r\nb = '''a\r\nb'''\r\n");
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
}

#[test]
fn super_table_defined_twice() {
    for src in [
        "[a.b]\n[a]\n[a]\n",
        "[a.b]\nx = 1\n[a]\ny = 1\n[a]\nz = 1\n",
        "[[a.b]]\n[a]\n[a]\n",
    ] {
        let p = parse(src);
        assert!(p.errors.is_empty(), "{:#?}", p.errors);
        assert!(p.into_dom().validate().is_err(), "{src}");
    }

    for src in ["[a.b]\n[a]\n", "[[a.b]]\n[a]\n[a.c]\n"] {
        assert!(parse(src).into_dom().validate().is_ok(), "{src}");
    }
}

#[test]
fn errors_in_tables_in_arrays_of_tables() {
    let src = r#"
[[a]]
[a.b]
c = 1
c = 2
"#;

    assert!(parse(src).into_dom().validate().is_err());

    let src = r#"
[[a.b]]

[a]
b.y = 2
"#;

    assert!(parse(src).into_dom().validate().is_err());
}

#[test]
fn inline_table_with_comments() {
    let src = r#"
t = { # c0
  a = 1, # c1
  b = { c = 2 }
  , d = [1,
  2], # c2
}
"#;

    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);

    // Newlines and comments are direct children of the inline table, like in arrays.
    let syntax = p.clone().into_syntax();
    let inline_table = syntax
        .descendants()
        .find(|n| n.kind() == SyntaxKind::INLINE_TABLE)
        .unwrap();
    let count = |kind: SyntaxKind| {
        inline_table
            .children_with_tokens()
            .filter(|t| t.kind() == kind)
            .count()
    };
    assert_eq!(count(SyntaxKind::COMMENT), 3);
    assert_eq!(count(SyntaxKind::NEWLINE), 4);
    assert_eq!(count(SyntaxKind::ENTRY), 3);

    let dom = p.into_dom();
    assert!(dom.validate().is_ok());
    let c = dom.get("t").get("b").get("c");
    assert_eq!(c.as_integer().unwrap().value().as_positive(), Some(2));
    let d = dom.get("t").get("d");
    assert_eq!(d.as_array().unwrap().items().read().len(), 2);

    for src in ["t = {,}", "t = {a = 1,,}", "t = {a = 1\n b = 2}", "t = {\n"] {
        assert!(!parse(src).errors.is_empty(), "{src:?}");
    }
}

#[test]
fn escape_control_characters() {
    assert_eq!(
        crate::util::escape("\u{0}\u{1b}\u{7f}\t\u{80}"),
        "\\u0000\\u001B\\u007F\\t\u{80}"
    );
}
