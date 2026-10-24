use taplo::{dom::Node, parser::parse};

pub fn json_to_toml(json: &str, inline: bool) -> Result<String, anyhow::Error> {
    let root: Node = serde_json::from_str(json)?;
    Ok(root.to_toml(inline, false))
}

pub fn toml_to_json(toml: &str) -> Result<String, anyhow::Error> {
    let root = parse(toml).into_dom();
    Ok(serde_json::to_string_pretty(&root)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_to_toml_round_trip() {
        let json = r#"{"a b":"\u0001\u001b\u007f\t","x":1.0,"y":1e300,"z":-0.5,"it's":"q'","a.b":1,"":2,"ключ":"значение","t":{"u v":[1.5,{"w":"\u0000"}]},"arr":[{"k":1},{"k":2}]}"#;

        for inline in [false, true] {
            let mut toml = json_to_toml(json, inline).unwrap();
            if inline {
                // An inline table is a value, not a document.
                toml = format!("v = {toml}");
            }
            let parse = parse(&toml);
            assert!(parse.errors.is_empty(), "{toml}\n{:?}", parse.errors);
            let dom = parse.into_dom();
            assert!(dom.validate().is_ok(), "{toml}");

            let mut expected: serde_json::Value = serde_json::from_str(json).unwrap();
            if inline {
                expected = serde_json::json!({ "v": expected });
            }
            let actual = serde_json::to_value(&dom).unwrap();
            assert_eq!(expected, actual, "{toml}");
        }
    }
}
