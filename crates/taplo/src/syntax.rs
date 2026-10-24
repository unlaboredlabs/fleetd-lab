//! Declaration of the syntax tokens and lexer implementation.

#![allow(non_camel_case_types)]

use logos::{Lexer, Logos};

/// Enum containing all the tokens in a syntax tree.
#[derive(Logos, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u16)]
pub enum SyntaxKind {
    #[regex(r"([ \t])+")]
    WHITESPACE = 0,

    #[regex(r"(\n|\r\n)+")]
    NEWLINE,

    #[regex(r"#[^\n\r]*")]
    COMMENT,

    #[regex(r"[A-Za-z0-9_-]+", priority = 2)]
    IDENT,

    /// Not part of the regular TOML syntax, only used to allow
    /// glob patterns in keys.
    #[regex(r"[*?A-Za-z0-9_-]+")]
    IDENT_WITH_GLOB,

    #[token(".")]
    PERIOD,

    #[token(",")]
    COMMA,

    #[token("=")]
    EQ,

    #[regex(r#"""#, lex_string)]
    STRING,

    #[regex(r#"""""#, lex_multi_line_string)]
    MULTI_LINE_STRING,

    #[regex(r#"'"#, lex_string_literal)]
    STRING_LITERAL,

    #[regex(r#"'''"#, lex_multi_line_string_literal)]
    MULTI_LINE_STRING_LITERAL,

    #[regex(r"[+-]?[0-9_]+", priority = 4)]
    INTEGER,

    #[regex(r"0x[0-9A-Fa-f_]+")]
    INTEGER_HEX,

    #[regex(r"0o[0-7_]+")]
    INTEGER_OCT,

    #[regex(r"0b(0|1|_)+")]
    INTEGER_BIN,

    #[regex(r"[-+]?([0-9_]+(\.[0-9_]+)?([eE][+-]?[0-9_]+)?|nan|inf)", priority = 3)]
    FLOAT,

    #[regex(r"true|false")]
    BOOL,

    // The date and time tokens only describe the shape of the values,
    // the ranges of the individual fields are validated by the parser.
    #[regex(r#"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][Tt ][0-9][0-9]:[0-9][0-9](?::[0-9][0-9](?:\.[0-9]+)?)?(?:[Zz]|[+-][0-9][0-9]:[0-9][0-9])"#)]
    DATE_TIME_OFFSET,

    #[regex(r#"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][Tt ][0-9][0-9]:[0-9][0-9](?::[0-9][0-9](?:\.[0-9]+)?)?"#)]
    DATE_TIME_LOCAL,

    #[regex(r#"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]"#)]
    DATE,

    #[regex(r#"[0-9][0-9]:[0-9][0-9](?::[0-9][0-9](?:\.[0-9]+)?)?"#)]
    TIME,

    #[token("[")]
    BRACKET_START,

    #[token("]")]
    BRACKET_END,

    #[token("{")]
    BRACE_START,

    #[token("}")]
    BRACE_END,

    #[error]
    ERROR,

    // composite types
    KEY,                // e.g.: parent.child
    VALUE,              // e.g.: "2"
    TABLE_HEADER,       // e.g.: [table]
    TABLE_ARRAY_HEADER, // e.g.: [[table]]
    ENTRY,              // e.g.: key = "value"
    ARRAY,              // e.g.: [ 1, 2 ]
    INLINE_TABLE,       // e.g.: { key = "value" }

    ROOT, // root node
}

impl From<SyntaxKind> for rowan::SyntaxKind {
    fn from(kind: SyntaxKind) -> Self {
        Self(kind as u16)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Lang {}
impl rowan::Language for Lang {
    type Kind = SyntaxKind;
    fn kind_from_raw(raw: rowan::SyntaxKind) -> Self::Kind {
        assert!(raw.0 <= SyntaxKind::ROOT as u16);
        unsafe { std::mem::transmute::<u16, SyntaxKind>(raw.0) }
    }
    fn kind_to_raw(kind: Self::Kind) -> rowan::SyntaxKind {
        kind.into()
    }
}

pub type SyntaxNode = rowan::SyntaxNode<Lang>;
pub type SyntaxToken = rowan::SyntaxToken<Lang>;
pub type SyntaxElement = rowan::NodeOrToken<SyntaxNode, SyntaxToken>;

fn lex_string(lex: &mut Lexer<SyntaxKind>) -> bool {
    let remainder: &str = lex.remainder();
    let mut escaped = false;

    let mut total_len = 0;

    for c in remainder.chars() {
        total_len += c.len_utf8();

        if c == '\\' {
            escaped = !escaped;
            continue;
        }

        if c == '"' && !escaped {
            lex.bump(total_len);
            return true;
        }

        escaped = false;
    }
    false
}

fn lex_multi_line_string(lex: &mut Lexer<SyntaxKind>) -> bool {
    lex_multi_line(lex, b'"', true)
}

/// Lexes the rest of a multi-line string after the opening delimiter.
///
/// Up to two quotes are allowed right before the closing delimiter,
/// they are part of the string.
fn lex_multi_line(lex: &mut Lexer<SyntaxKind>, quote: u8, escapes: bool) -> bool {
    // We only look for ASCII characters, so it is fine to work with bytes,
    // the end of the token always falls on a character boundary.
    let bytes = lex.remainder().as_bytes();

    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];

        if escapes && b == b'\\' {
            i += 2;
            continue;
        }

        if b == quote {
            let quote_count = bytes[i..].iter().take_while(|b| **b == quote).count();

            if quote_count >= 3 {
                if quote_count > 5 {
                    return false;
                }

                lex.bump(i + quote_count);
                return true;
            }

            i += quote_count;
            continue;
        }

        i += 1;
    }

    false
}

fn lex_string_literal(lex: &mut Lexer<SyntaxKind>) -> bool {
    let remainder: &str = lex.remainder();
    let mut total_len = 0;

    for c in remainder.chars() {
        total_len += c.len_utf8();

        if c == '\'' {
            lex.bump(total_len);
            return true;
        }
    }
    false
}

fn lex_multi_line_string_literal(lex: &mut Lexer<SyntaxKind>) -> bool {
    lex_multi_line(lex, b'\'', false)
}
