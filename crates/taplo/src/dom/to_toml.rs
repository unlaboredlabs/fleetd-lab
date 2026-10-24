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

                    // We make two runs to put tables and array of tables last.
                    // No tables:
                    for (key, node) in entries.iter().filter(|(_, n)| !needs_header(n)) {
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
                    for (key, node) in entries.iter().filter(|(_, n)| needs_header(n)) {
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

                    if prefer_single_quote && escaped == s.value() {
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
                write!(f, "{}", float.value())?;
            }
            Node::Date(d) => write!(f, "{}", d.value())?,
            Node::Invalid(_) => {}
        }

        Ok(())
    }
}

/// Whether the node is written with a table or array of tables header,
/// inline tables and arrays are written as values.
fn needs_header(node: &Node) -> bool {
    match node {
        Node::Table(t) => t.inner.kind != TableKind::Inline,
        Node::Array(arr) => arr.inner.kind == ArrayKind::Tables,
        _ => false,
    }
}

impl core::fmt::Display for Node {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        self.to_toml_impl(f, Keys::empty(), false, false, false)
    }
}

#[cfg(test)]
mod tests {
    use crate::parser::parse;

    #[test]
    fn inline_tables_are_written_as_values() {
        let src = r#"
a = { b = 1 }
c = { d = {
  e = 2,
} }

[t]
f = { g = 3 }
h = 4

[t.u]
i = 5
"#;

        let toml = parse(src).into_dom().to_toml(false, false);

        let p = parse(&toml);
        assert!(p.errors.is_empty(), "{toml}\n{:#?}", p.errors);

        let dom = p.into_dom();
        assert!(dom.validate().is_ok(), "{toml}");
        assert_eq!(
            serde_json::to_value(&dom).unwrap(),
            serde_json::to_value(parse(src).into_dom()).unwrap(),
            "{toml}"
        );
        assert!(dom.path(&"t.f.g".parse().unwrap()).is_some(), "{toml}");
        assert!(dom.path(&"t.t".parse().unwrap()).is_none(), "{toml}");
    }
}
