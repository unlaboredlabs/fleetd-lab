//! Conversion and schema validation of TOML 1.1 documents.

use serde_json::{json, Value};
use taplo_common::convert::{json_to_toml, toml_to_json};

const FEATURES: &str = include_str!("../../../test-data/toml-1.1/features.toml");

#[test]
fn toml_1_1_to_json() {
    let value: Value = serde_json::from_str(&toml_to_json(FEATURES).unwrap()).unwrap();

    assert_eq!(value["esc"], "\u{1b}[1mbold\u{1b}[0m");
    assert_eq!(value["hex"], "S\u{f8}rmirb\u{e6}ren A");
    assert_eq!(value["multi-line-hex"], "Hi\u{1b}");
    assert_eq!(value["time"], "13:37:00");
    assert_eq!(value["local-date-time"], "1979-05-27T07:32:00");
    assert_eq!(value["offset-date-time"], "1979-05-27T07:32:00Z");
    assert_eq!(value["negative-offset"], "1979-05-27T07:32:00-07:00");
    assert_eq!(value["trailing-comma"], json!({ "a": 1 }));
    assert_eq!(
        value["server"],
        json!({
            "host": "localhost",
            "ports": [8080, 8443],
            "tls": { "cert": "cert.pem", "key": "key.pem" },
            "hours": { "open": "08:00:00", "close": "17:30:00" }
        })
    );
    assert_eq!(
        value["table"],
        json!({ "inline": { "a": 1, "b": { "c": 2 } }, "after": true })
    );
}

#[test]
fn json_to_toml_round_trip() {
    let json = toml_to_json(FEATURES).unwrap();

    for inline in [false, true] {
        let toml = json_to_toml(&json, inline).unwrap();
        let toml = if inline {
            format!("value = {toml}")
        } else {
            toml
        };

        let parse = taplo::parser::parse(&toml);
        assert!(parse.errors.is_empty(), "{toml}\n{:#?}", parse.errors);

        let mut value: Value = serde_json::from_str(&toml_to_json(&toml).unwrap()).unwrap();
        if inline {
            value = value["value"].take();
        }

        assert_eq!(
            value,
            serde_json::from_str::<Value>(&json).unwrap(),
            "{toml}"
        );
    }
}

#[cfg(all(feature = "schema", feature = "reqwest"))]
mod schema {
    use super::FEATURES;
    use serde_json::json;
    use std::sync::Arc;
    use taplo_common::{environment::native::NativeEnvironment, schema::Schemas};
    use url::Url;

    fn run<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }

    async fn schemas(schema: serde_json::Value) -> (Schemas<NativeEnvironment>, Url) {
        let url: Url = "test://toml-1.1/schema.json".parse().unwrap();
        let schemas = Schemas::new(
            NativeEnvironment::new(),
            taplo_common::util::get_reqwest_client(std::time::Duration::from_secs(1)).unwrap(),
        );
        schemas.add_schema(&url, Arc::new(schema)).await;
        (schemas, url)
    }

    #[test]
    fn validate_toml_1_1_values() {
        run(async {
            let (schemas, url) = schemas(json!({
                "type": "object",
                "properties": {
                    "esc": { "const": "\u{1b}[1mbold\u{1b}[0m" },
                    "hex": { "const": "S\u{f8}rmirb\u{e6}ren A" },
                    "multi-line-hex": { "const": "Hi\u{1b}" },
                    "time": { "const": "13:37:00" },
                    "local-date-time": { "const": "1979-05-27T07:32:00" },
                    "offset-date-time": { "type": "string", "format": "date-time" },
                    "negative-offset": { "type": "string", "format": "date-time" },
                    "trailing-comma": {
                        "type": "object",
                        "properties": { "a": { "const": 1 } },
                        "required": ["a"],
                        "additionalProperties": false
                    },
                    "server": {
                        "type": "object",
                        "properties": {
                            "host": { "const": "localhost" },
                            "ports": { "const": [8080, 8443] },
                            "tls": {
                                "type": "object",
                                "properties": {
                                    "cert": { "const": "cert.pem" },
                                    "key": { "const": "key.pem" }
                                },
                                "required": ["cert", "key"],
                                "additionalProperties": false
                            },
                            "hours": {
                                "const": { "open": "08:00:00", "close": "17:30:00" }
                            }
                        },
                        "required": ["host", "ports", "tls", "hours"],
                        "additionalProperties": false
                    }
                }
            }))
            .await;

            let dom = taplo::parser::parse(FEATURES).into_dom();
            let errors = schemas.validate_root(&url, &dom).await.unwrap();
            assert!(
                errors.is_empty(),
                "{:#?}",
                errors
                    .iter()
                    .map(|e| e.error.to_string())
                    .collect::<Vec<_>>()
            );
        });
    }

    #[test]
    fn errors_in_multi_line_inline_tables() {
        run(async {
            let (schemas, url) = schemas(json!({
                "type": "object",
                "properties": {
                    "server": {
                        "type": "object",
                        "properties": {
                            "tls": {
                                "type": "object",
                                "properties": { "key": { "type": "integer" } }
                            }
                        }
                    }
                }
            }))
            .await;

            let dom = taplo::parser::parse(FEATURES).into_dom();
            let errors = schemas.validate_root(&url, &dom).await.unwrap();
            assert_eq!(errors.len(), 1);

            let ranges: Vec<_> = errors[0].text_ranges().collect();
            assert_eq!(ranges.len(), 1);
            assert_eq!(&FEATURES[ranges[0]], r#""key.pem""#);
        });
    }
}
