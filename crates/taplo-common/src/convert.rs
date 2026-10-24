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
    use super::{json_to_toml, toml_to_json};
    use serde_json::{json, Value};

    #[test]
    fn toml_1_1_to_json() {
        let toml = r#"# Ünïcödé comment — 日本語
esc = "\e[0m \x41\xe9"
lit = 'ñ — literal'
time = 07:32
local = 1979-05-27 07:32
offset = 1979-05-27T07:32Z
1 = "numeric key"
point = {
    x = 1, # the x coordinate
    # a comment line
    y = { z = [1, 2,], },
}
"#;
        let json = json!({
            "esc": "\u{1b}[0m A\u{e9}",
            "lit": "ñ — literal",
            "time": "07:32:00",
            "local": "1979-05-27T07:32:00",
            "offset": "1979-05-27T07:32:00Z",
            "1": "numeric key",
            "point": { "x": 1, "y": { "z": [1, 2] } },
        });

        let converted: Value = serde_json::from_str(&toml_to_json(toml).unwrap()).unwrap();
        assert_eq!(converted, json);

        let toml = json_to_toml(&json.to_string(), false).unwrap();
        let roundtrip: Value = serde_json::from_str(&toml_to_json(&toml).unwrap()).unwrap();
        assert_eq!(roundtrip, json, "{toml}");
    }
}
