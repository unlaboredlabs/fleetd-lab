//! Declaration of the syntax tokens and lexer implementation.

#![allow(non_camel_case_types)]

use logos::{Lexer as LogosLexer, Logos};
use std::ops::Range;

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

    // Date and time tokens are not lexed by Logos,
    // see [`Lexer`] and [`lex_date_time`].
    DATE_TIME_OFFSET,
    DATE_TIME_LOCAL,
    DATE,
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

impl SyntaxKind {
    /// Creates the plain [`Logos`] lexer of the tokens.
    ///
    /// **This lexer does not produce date and time tokens**
    /// ([`DATE_TIME_OFFSET`](SyntaxKind::DATE_TIME_OFFSET),
    /// [`DATE_TIME_LOCAL`](SyntaxKind::DATE_TIME_LOCAL),
    /// [`DATE`](SyntaxKind::DATE) and [`TIME`](SyntaxKind::TIME)),
    /// date and time values are split into other tokens instead.
    ///
    /// Use [`Lexer`] to lex TOML documents, it is also what the parser uses.
    #[deprecated(
        note = "does not produce date and time tokens, use `taplo::syntax::Lexer::new` instead"
    )]
    pub fn lexer(source: &str) -> LogosLexer<'_, SyntaxKind> {
        <SyntaxKind as Logos>::lexer(source)
    }
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

/// The TOML lexer.
///
/// Date and time values are scanned by [`lex_date_time`],
/// everything else is lexed by the [`Logos`] lexer of [`SyntaxKind`].
///
/// Logos does not backtrack reliably when a longer pattern fails to match,
/// which made it produce wrong tokens for date-times
/// that share prefixes with integers, floats and keys.
pub struct Lexer<'s> {
    inner: LogosLexer<'s, SyntaxKind>,
    span: Range<usize>,
}

impl<'s> Lexer<'s> {
    pub fn new(source: &'s str) -> Self {
        Self {
            inner: <SyntaxKind as Logos>::lexer(source),
            span: 0..0,
        }
    }

    /// The byte range of the current token.
    pub fn span(&self) -> Range<usize> {
        self.span.clone()
    }

    /// The source text of the current token.
    pub fn slice(&self) -> &'s str {
        &self.inner.source()[self.span.clone()]
    }

    /// The source text after the current token.
    pub fn remainder(&self) -> &'s str {
        &self.inner.source()[self.span.end..]
    }
}

impl Iterator for Lexer<'_> {
    type Item = SyntaxKind;

    fn next(&mut self) -> Option<Self::Item> {
        let start = self.span.end;

        if let Some((kind, len)) = lex_date_time(self.remainder()) {
            // The Logos lexer always continues from the end of its
            // current token, so we extend it over the date-time.
            self.inner.bump(len);
            self.span = start..start + len;
            return Some(kind);
        }

        let kind = self.inner.next();
        self.span = self.inner.span();
        kind
    }
}

/// Scans a date and/or time value at the start of the given text.
///
/// Returns the kind and the length of the token, or `None` if the text
/// does not start with one.
///
/// Only the shape of the value is checked here (e.g. `2000-99-99` is lexed as a date),
/// as date-like text can also be a valid bare key.
/// The values are validated by the parser.
fn lex_date_time(s: &str) -> Option<(SyntaxKind, usize)> {
    let b = s.as_bytes();

    let is_date = digits(b, 0, 4)
        && b.get(4) == Some(&b'-')
        && digits(b, 5, 2)
        && b.get(7) == Some(&b'-')
        && digits(b, 8, 2);

    if !is_date {
        return lex_time(b).map(|len| (SyntaxKind::TIME, len));
    }

    if let Some(b'T' | b't' | b' ') = b.get(10) {
        if let Some(time_len) = lex_time(&b[11..]) {
            let len = 11 + time_len;

            return match b.get(len) {
                Some(b'Z' | b'z') => Some((SyntaxKind::DATE_TIME_OFFSET, len + 1)),
                Some(b'+' | b'-')
                    if digits(b, len + 1, 2)
                        && b.get(len + 3) == Some(&b':')
                        && digits(b, len + 4, 2) =>
                {
                    Some((SyntaxKind::DATE_TIME_OFFSET, len + 6))
                }
                _ => Some((SyntaxKind::DATE_TIME_LOCAL, len)),
            };
        }
    }

    // The text is a bare key or invalid (e.g. `2000-01-01T` or `2000-01-01abc`),
    // let Logos handle it.
    if let Some(c) = b.get(10) {
        if c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-' {
            return None;
        }
    }

    Some((SyntaxKind::DATE, 10))
}

/// Scans `HH:MM[:SS[.fraction]]`, returns the length.
fn lex_time(b: &[u8]) -> Option<usize> {
    if !(digits(b, 0, 2) && b.get(2) == Some(&b':') && digits(b, 3, 2)) {
        return None;
    }

    if !(b.get(5) == Some(&b':') && digits(b, 6, 2)) {
        return Some(5);
    }

    if b.get(8) == Some(&b'.') && digits(b, 9, 1) {
        let fraction_len = b[9..].iter().take_while(|c| c.is_ascii_digit()).count();
        return Some(9 + fraction_len);
    }

    Some(8)
}

fn digits(b: &[u8], start: usize, count: usize) -> bool {
    b.len() >= start + count && b[start..start + count].iter().all(u8::is_ascii_digit)
}

fn lex_string(lex: &mut LogosLexer<SyntaxKind>) -> bool {
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

fn lex_multi_line_string(lex: &mut LogosLexer<SyntaxKind>) -> bool {
    let remainder: &str = lex.remainder();

    let mut total_len = 0;
    let mut quote_count = 0;

    let mut escaped = false;

    // As the string can contain ",
    // we can end up with more than 3 "-s at
    // the end, in that case we need to include all
    // in the string.
    let mut quotes_found = false;

    for c in remainder.chars() {
        if quotes_found {
            if c != '"' {
                if quote_count >= 6 {
                    return false;
                }

                lex.bump(total_len);
                return true;
            } else {
                quote_count += 1;
                total_len += c.len_utf8();
                continue;
            }
        }
        total_len += c.len_utf8();

        if c == '\\' {
            escaped = true;
            continue;
        }

        if c == '"' && !escaped {
            quote_count += 1;
        } else {
            quote_count = 0;
        }

        if quote_count == 3 {
            quotes_found = true;
        }

        escaped = false;
    }

    // End of input
    if quotes_found {
        if quote_count >= 6 {
            return false;
        }

        lex.bump(total_len);
        true
    } else {
        false
    }
}

fn lex_string_literal(lex: &mut LogosLexer<SyntaxKind>) -> bool {
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

fn lex_multi_line_string_literal(lex: &mut LogosLexer<SyntaxKind>) -> bool {
    let remainder: &str = lex.remainder();

    let mut total_len = 0;
    let mut quote_count = 0;

    // As the string can contain ',
    // we can end up with more than 3 '-s at
    // the end, in that case we need to include all
    // in the string.
    let mut quotes_found = false;

    for c in remainder.chars() {
        if quotes_found {
            if c != '\'' {
                lex.bump(total_len);
                return true;
            } else {
                if quote_count > 4 {
                    return false;
                }

                quote_count += 1;
                total_len += c.len_utf8();
                continue;
            }
        }
        total_len += c.len_utf8();

        if c == '\'' {
            quote_count += 1;
        } else {
            quote_count = 0;
        }

        if quote_count == 3 {
            quotes_found = true;
        }
    }

    // End of input
    if quotes_found {
        lex.bump(total_len);
        true
    } else {
        false
    }
}
