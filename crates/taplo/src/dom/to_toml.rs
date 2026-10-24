use crate::util::escape;

use super::{
    node::{ArrayKind, DomNode, IntegerRepr, IntegerValue, TableKind},
    Keys, Node,
};
use std::fmt::{Formatter, Write};

impl Node {
    pub fn to_toml(&self, inline: bool, prefer_single_quote: bool) -> String {
        let mut s = String::new();
        self.to_toml_fmt(&mut s, inline, prefer_single_quote)
            .unwrap();
        s
    }

    pub fn to_toml_fmt(
        &self,
        f: &mut impl Write,
        inline: bool,
        prefer_single_quote: bool,
    ) -> core::fmt::Result {
        self.to_toml_impl(f, Keys::empty(), inline, false, prefer_single_quote)
    }

    fn to_toml_impl(
        &self,
        f: &mut impl Write,
        parent_keys: Keys,
        inline: bool,
        no_header: bool,
        prefer_single_quote: bool,
    ) -> core::fmt::Result {
        if let Node::Bool(_) | Node::Str(_) | Node::Integer(_) | Node::Float(_) | Node::Date(_) =
            self
        {
            if !parent_keys.is_empty() {
                f.write_str(parent_keys.dotted())?;
                f.write_str(" = ")?;
            }

            // Use the original representation of primitives if available.
            if let Some(syntax) = self.syntax() {
                return write!(f, "{}", syntax);
            }
        }

        match self {
            Node::Table(table) => {
                if table.inner.kind == TableKind::Inline || inline {
                    if !parent_keys.is_empty() {
                        f.write_str(parent_keys.dotted())?;
                        f.write_str(" = ")?;
                    }

                    f.write_str("{ ")?;

                    let entries = table.entries().read();

                    let mut first = true;
                    for (key, node) in entries.iter() {
                        if !first {
                            f.write_str(", ")?;
                        }
                        node.to_toml_impl(f, key.clone().into(), true, false, prefer_single_quote)?;
                        first = false;
                    }

                    f.write_str(" }")?;
                } else {
                    if !parent_keys.is_empty() && !no_header {
                        f.write_str("[")?;
                        f.write_str(parent_keys.dotted())?;
                        f.write_str("]\n")?;
                    }

                    let entries = table.entries().read();

                    // Inline tables are written as values.
                    let is_table = |n: &Node| {
                        n.as_table()
                            .map(|t| t.inner.kind != TableKind::Inline)
                            .unwrap_or(false)
                            || n.as_array()
                                .map(|n| n.inner.kind == ArrayKind::Tables)
                                .unwrap_or(false)
                    };

                    // We make two runs to put tables and array of tables last.
                    // No tables:
                    for (key, node) in entries.iter().filter(|(_, n)| !is_table(n)) {
                        node.to_toml_impl(
                            f,
                            key.clone().into(),
                            false,
                            false,
                            prefer_single_quote,
                        )?;
                        f.write_char('\n')?;
                    }

                    // Tables only:
                    for (key, node) in entries.iter().filter(|(_, n)| is_table(n)) {
                        node.to_toml_impl(
                            f,
                            parent_keys.join(key.clone()),
                            false,
                            false,
                            prefer_single_quote,
                        )?;
                    }
                }
            }
            Node::Array(array) => {
                if array.inner.kind == ArrayKind::Inline || inline {
                    if !parent_keys.is_empty() {
                        f.write_str(parent_keys.dotted())?;
                        f.write_str(" = ")?;
                    }

                    f.write_str("[ ")?;

                    let items = array.items().read();

                    let mut first = true;
                    for node in items.iter() {
                        if !first {
                            f.write_str(", ")?;
                        }
                        node.to_toml_impl(f, Keys::empty(), true, false, prefer_single_quote)?;
                        first = false;
                    }

                    f.write_str(" ]")?;
                } else {
                    let items = array.items().read();

                    for node in items.iter() {
                        f.write_str("[[")?;
                        f.write_str(parent_keys.dotted())?;
                        f.write_str("]]\n")?;
                        node.to_toml_impl(
                            f,
                            parent_keys.clone(),
                            false,
                            true,
                            prefer_single_quote,
                        )?;
                    }
                }
            }
            Node::Bool(b) => write!(f, "{}", b.value())?,
            Node::Str(s) => {
                if let Some(syntax) = s.syntax() {
                    write!(f, "{}", syntax)?;
                } else {
                    let escaped = escape(s.value());

                    if prefer_single_quote && escaped == s.value() && !s.value().contains('\'') {
                        write!(f, "'{}'", s.value())?;
                    } else {
                        write!(f, r#""{escaped}""#)?;
                    }
                }
            }
            Node::Integer(i) => match i.inner.repr {
                IntegerRepr::Dec => match i.value() {
                    IntegerValue::Negative(i) => write!(f, "{i}")?,
                    IntegerValue::Positive(i) => write!(f, "{i}")?,
                },
                IntegerRepr::Bin => write!(f, "{:#b}", i.value().as_positive().unwrap())?,
                IntegerRepr::Oct => write!(f, "{:#o}", i.value().as_positive().unwrap())?,
                IntegerRepr::Hex => write!(f, "{:#X}", i.value().as_positive().unwrap())?,
            },
            Node::Float(float) => {
                let v = float.value();
                if v.is_nan() {
                    f.write_str("nan")?;
                } else if v.is_infinite() {
                    f.write_str(if v > 0.0 { "inf" } else { "-inf" })?;
                } else {
                    // Debug always includes a fraction or an exponent (`1.0`, `1e300`),
                    // so the value is not turned into an integer.
                    write!(f, "{v:?}")?;
                }
            }
            Node::Date(d) => write!(f, "{}", d.value())?,
            Node::Invalid(_) => {}
        }

        Ok(())
    }
}

impl core::fmt::Display for Node {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        self.to_toml_impl(f, Keys::empty(), false, false, false)
    }
}

#[cfg(all(test, feature = "serde"))]
mod tests {
    use crate::dom::{node::Key, Node};
    use serde::{de::IntoDeserializer, Deserialize};

    fn to_toml(json: &str) -> String {
        serde_json::from_str::<Node>(json)
            .unwrap()
            .to_toml(false, false)
    }

    #[test]
    fn to_toml_escapes_control_characters() {
        assert_eq!(
            to_toml(r#"{"s":"\u0000\u0001\b\t\n\f\r\u001b\u001f\u007f\"\\é"}"#),
            "s = \"\\u0000\\u0001\\b\\t\\n\\f\\r\\u001B\\u001F\\u007F\\\"\\\\é\"\n"
        );
    }

    #[test]
    fn to_toml_quotes_keys() {
        for (key, expected) in [
            ("bare-key_09", "bare-key_09"),
            ("a b", "'a b'"),
            ("a.b", "'a.b'"),
            ("", "''"),
            ("ключ", "'ключ'"),
            ("it's", r#""it's""#),
            ("tab\tkey", r#""tab\tkey""#),
            ("\u{1b}", r#""\u001B""#),
        ] {
            assert_eq!(Key::new(key).to_string(), expected);
        }

        assert_eq!(
            to_toml(r#"{"a b":{"c.d":{"it's":1}}}"#),
            "['a b']\n['a b'.'c.d']\n\"it's\" = 1\n"
        );
    }

    #[test]
    fn to_toml_inline_tables_are_values() {
        let src = "a = { b = 1 }\n[[c]]\nd = { e = 2 }\n";
        let dom = crate::parser::parse(src).into_dom();
        assert_eq!(dom.to_toml(false, false), src);
    }

    #[test]
    fn to_toml_keeps_floats() {
        assert_eq!(
            to_toml(r#"{"a":1.0,"b":-0.5,"c":1e300,"d":2.5e-8,"e":3}"#),
            "a = 1.0\nb = -0.5\nc = 1e300\nd = 2.5e-8\ne = 3\n"
        );

        for (v, expected) in [
            (f64::NAN, "nan"),
            (f64::INFINITY, "inf"),
            (f64::NEG_INFINITY, "-inf"),
        ] {
            let node = Node::deserialize(
                IntoDeserializer::<serde::de::value::Error>::into_deserializer(v),
            )
            .unwrap();
            assert_eq!(node.to_toml(false, false), expected);
        }
    }
}
