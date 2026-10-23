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

/// Parse a valid document and return its data as JSON.
fn parse_valid(src: &str) -> serde_json::Value {
    let p = parse(src);
    assert!(p.errors.is_empty(), "{:#?}", p.errors);
    let dom = p.into_dom();
    assert!(dom.validate().is_ok(), "{:#?}", dom.validate().err());
    serde_json::to_value(&dom).unwrap()
}

/// Assert that a document is rejected either by the parser or the DOM.
fn assert_invalid(src: &str) {
    let p = parse(src);
    assert!(
        !p.errors.is_empty() || p.into_dom().validate().is_err(),
        "expected invalid TOML: {src:?}"
    );
}

#[test]
fn toml_1_1_escapes() {
    let value = parse_valid(
        r#"
esc = "\e[0m"
hex = "\x00\x61\xE9\xff"
multi = """\e\x41"""
"\x61\e" = 1
"#,
    );

    assert_eq!(value["esc"], "\u{1b}[0m");
    assert_eq!(value["hex"], "\u{0}a\u{e9}\u{ff}");
    assert_eq!(value["multi"], "\u{1b}A");
    assert_eq!(value["a\u{1b}"], 1);

    assert_invalid(r#"a = "\x1""#);
    assert_invalid(r#"a = "\xg0""#);
    assert_invalid(r#"a = "\E""#);
    // Escapes are not processed in literal strings, so these are fine.
    assert_eq!(parse_valid(r"a = '\e\x'")["a"], r"\e\x");
}

#[test]
fn toml_1_1_optional_seconds() {
    let value = parse_valid(
        r#"
t = 14:15
ldt = 2010-02-03 14:15
odt = 2010-02-03T14:15Z
odt2 = 1979-05-27 07:32-07:00
arr = [14:15, 2010-02-03t14:15z]
"#,
    );

    assert_eq!(value["t"], "14:15:00");
    assert_eq!(value["ldt"], "2010-02-03T14:15:00");
    assert_eq!(value["odt"], "2010-02-03T14:15:00Z");
    assert_eq!(value["odt2"], "1979-05-27T07:32:00-07:00");
    assert_eq!(value["arr"][0], "14:15:00");
    assert_eq!(value["arr"][1], "2010-02-03T14:15:00Z");

    // Fractions require seconds.
    assert_invalid("a = 14:15.5");
    assert_invalid("a = 14:");
    assert_invalid("a = 2010-02-03T14");
}

#[test]
fn date_time_values() {
    let value = parse_valid(
        r#"
odt = 1979-05-27T00:32:00.999999-07:00
ldt = 1979-05-27T00:32:00.5
t = 00:32:00.123456789123
"#,
    );

    assert_eq!(value["odt"], "1979-05-27T00:32:00.999999-07:00");
    assert_eq!(value["ldt"], "1979-05-27T00:32:00.5");
    // Precision beyond nanoseconds is truncated.
    assert_eq!(value["t"], "00:32:00.123456789");

    // Only "." is a valid fraction separator.
    assert_invalid("a = 1979-05-27T00:32:00,5");
}

#[test]
fn toml_1_1_inline_tables() {
    let value = parse_valid(
        r#"
tbl = { # comment after the brace
    key      = "a string", # comment after an entry

    # comment on its own line
    moar-tbl =  {
        key = 1,
    },
    arr = [
        1, # comment in an array
    ],
    dotted.key = true
    ,
}
trailing = { a = 1, }
"#,
    );

    assert_eq!(
        value,
        serde_json::json!({
            "tbl": {
                "key": "a string",
                "moar-tbl": { "key": 1 },
                "arr": [1],
                "dotted": { "key": true },
            },
            "trailing": { "a": 1 },
        })
    );

    assert_invalid("a = { b = 1,, }");
    assert_invalid("a = { , }");
    assert_invalid("a = { b = 1 c = 2 }");
    assert_invalid("a = { b\n= 1 }");
    assert_invalid("a = { b =\n1 }");
    assert_invalid("a = { b = 1 # comment }");
    assert_invalid("a = { b = 1 }\na.c = 2");
}

#[test]
fn non_ascii_in_comments_and_strings() {
    // U+0080 to U+009F are not control characters as far as TOML is concerned.
    let value = parse_valid(
        "# \u{80} \u{9f} \u{ff} \u{d7ff} \u{e000} \u{ffff} \u{10000} \u{10ffff}\n\
         basic = \"\u{80}\u{9f}\"\n\
         literal = '\u{80}\u{9f}'\n\
         multi = \"\"\"\u{80}\u{9f}\"\"\"\n\
         multi_literal = '''\u{80}\u{9f}'''\n\
         \"\u{85}\" = 1\n\
         '\u{86}' = 2\n",
    );

    assert_eq!(value["basic"], "\u{80}\u{9f}");
    assert_eq!(value["literal"], "\u{80}\u{9f}");
    assert_eq!(value["multi"], "\u{80}\u{9f}");
    assert_eq!(value["multi_literal"], "\u{80}\u{9f}");
}

#[test]
fn control_characters() {
    for c in ('\u{0}'..='\u{8}')
        .chain('\u{a}'..='\u{1f}')
        .chain(['\u{7f}'])
    {
        if c == '\n' {
            continue;
        }

        assert_invalid(&format!("# {c}"));
        assert_invalid(&format!("a = \"{c}\""));
        assert_invalid(&format!("a = '{c}'"));

        if c != '\r' {
            assert_invalid(&format!("a = \"\"\"{c}\"\"\""));
            assert_invalid(&format!("a = '''{c}'''"));
        }
    }

    // A lone CR is not a newline.
    assert_invalid("a = \"\"\"null\r\"\"\"");
    assert_invalid("a = '''null\r'''");
    assert_eq!(parse_valid("a = \"\"\"x\r\ny\"\"\"")["a"], "x\r\ny");
    assert_eq!(parse_valid("a = '''x\r\ny'''")["a"], "x\r\ny");
}

#[test]
fn invalid_character_error_ranges_are_byte_offsets() {
    let src = "# \u{e9}\u{e9}\u{1}";
    let errors = parse(src).errors;

    assert_eq!(errors.len(), 1, "{errors:#?}");
    assert_eq!(u32::from(errors[0].range.start()), 6);
}

#[test]
fn multi_line_string_ending_in_backslash() {
    assert_eq!(parse_valid(r#"a = """x\\""""#)["a"], r"x\");
    assert_eq!(parse_valid(r#"a = """x\""""""#)["a"], r#"x"""#);
}

#[test]
fn numeric_dotted_keys() {
    let value = parse_valid("01.23 = true\n1.2e3 = 1\n-1.5 = 2\n");

    assert_eq!(value["01"]["23"], true);
    assert_eq!(value["1"]["2e3"], 1);
    assert_eq!(value["-1"]["5"], 2);

    assert_invalid("+1.5 = 1");
    assert_invalid("1.2e+3 = 1");
}

#[test]
fn implicit_table_defined_once() {
    assert_invalid("[a.b]\n[a]\n[a]\n");
    assert_invalid("[dependencies.foo]\n[dependencies]\nlibc = 1\n[dependencies]\nrand = 1\n");

    let value = parse_valid("[a.b]\nc = 1\n[a]\nd = 2\n");
    assert_eq!(
        value,
        serde_json::json!({ "a": { "b": { "c": 1 }, "d": 2 } })
    );
}

#[test]
fn escape_produces_valid_strings() {
    let value = "\u{0}\u{8}\t\n\u{c}\r\u{1b}\u{1f}\u{7f}\"\\\u{80}é";
    let src = format!("a = \"{}\"", crate::util::escape(value));

    assert_eq!(parse_valid(&src)["a"], value);
}

#[test]
fn to_toml_round_trip() {
    let src = r#"
s = "\e\x41"
t = 14:15
[x]
a = {
    b = 1, # comment
    c = { d = [1, 2] },
}
e = 1
[x.y]
f = 2
"#;
    let expected = parse_valid(src);

    let toml = parse(src).into_dom().to_toml(false, false);
    assert_eq!(parse_valid(&toml), expected, "{toml}");

    // Nodes without syntax are written from their values.
    let node: crate::dom::Node = serde_json::from_value(expected.clone()).unwrap();
    for prefer_single_quote in [false, true] {
        let toml = node.to_toml(false, prefer_single_quote);
        assert_eq!(parse_valid(&toml), expected, "{toml}");
    }

    let value = serde_json::json!({ "s": "\u{1b}\u{0} it's" });
    let node: crate::dom::Node = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(parse_valid(&node.to_toml(false, true)), value);
}
