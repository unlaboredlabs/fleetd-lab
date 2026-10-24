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

    #[regex(r#"(?:[0-9][0-9][0-9][0-9]-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:(?:[0-9][0-9](?:0[48]|[2468][048]|[13579][26]))|(?:[2468][048]|[13579][26])00)-02-29)(?:T|t| )(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?(?:[Zz]|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])"#)]
    DATE_TIME_OFFSET,

    #[regex(r#"(?:[0-9][0-9][0-9][0-9]-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:(?:[0-9][0-9](?:0[48]|[2468][048]|[13579][26]))|(?:[2468][048]|[13579][26])00)-02-29)(?:T|t| )(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?"#)]
    DATE_TIME_LOCAL,

    #[regex(r#"(?:[0-9][0-9][0-9][0-9]-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1[0-9]|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:(?:[0-9][0-9](?:0[48]|[2468][048]|[13579][26]))|(?:[2468][048]|[13579][26])00)-02-29)"#)]
    DATE,

    #[regex(r#"(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?"#)]
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

/// Scans a date, time or date-time at the start of `s`.
///
/// The regular expressions above are not always picked up by Logos
/// (e.g. a local date-time can come out as an `INTEGER`), so the parser
/// uses this to determine the actual kind and length of date-time tokens.
///
/// Returns `None` if `s` does not start with a valid date or time.
pub(crate) fn lex_date_time(s: &str) -> Option<(SyntaxKind, usize)> {
    let b = s.as_bytes();

    if let Some(date_len) = scan_date(b) {
        let time_start = date_len + 1;

        if matches!(b.get(date_len), Some(b'T' | b't' | b' ')) {
            if let Some(time_len) = scan_time(&b[time_start..]) {
                let time_end = time_start + time_len;
                return match scan_offset(&b[time_end..]) {
                    Some(offset_len) => Some((SyntaxKind::DATE_TIME_OFFSET, time_end + offset_len)),
                    None => Some((SyntaxKind::DATE_TIME_LOCAL, time_end)),
                };
            }
        }

        return Some((SyntaxKind::DATE, date_len));
    }

    scan_time(b).map(|len| (SyntaxKind::TIME, len))
}

fn two_digits(b: &[u8], at: usize) -> Option<u32> {
    match (b.get(at), b.get(at + 1)) {
        (Some(a @ b'0'..=b'9'), Some(b @ b'0'..=b'9')) => {
            Some(u32::from(a - b'0') * 10 + u32::from(b - b'0'))
        }
        _ => None,
    }
}

/// `YYYY-MM-DD`, with a valid month and day.
fn scan_date(b: &[u8]) -> Option<usize> {
    let year = two_digits(b, 0)? * 100 + two_digits(b, 2)?;
    if b.get(4) != Some(&b'-') || b.get(7) != Some(&b'-') {
        return None;
    }
    let month = two_digits(b, 5)?;
    let day = two_digits(b, 8)?;

    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };

    if day == 0 || day > days_in_month {
        return None;
    }

    Some(10)
}

/// `HH:MM[:SS[.fraction]]`, seconds are optional since TOML 1.1.
fn scan_time(b: &[u8]) -> Option<usize> {
    if two_digits(b, 0)? > 23 || b.get(2) != Some(&b':') || two_digits(b, 3)? > 59 {
        return None;
    }

    if b.get(5) != Some(&b':') {
        return Some(5);
    }

    if two_digits(b, 6)? > 59 {
        return None;
    }

    let mut len = 8;
    if b.get(len) == Some(&b'.') && b.get(len + 1).is_some_and(u8::is_ascii_digit) {
        len += 1;
        while b.get(len).is_some_and(u8::is_ascii_digit) {
            len += 1;
        }
    }

    Some(len)
}

/// `Z` or `+HH:MM` / `-HH:MM`.
fn scan_offset(b: &[u8]) -> Option<usize> {
    match b.first()? {
        b'Z' | b'z' => Some(1),
        b'+' | b'-' => {
            if two_digits(b, 1)? > 23 || b.get(3) != Some(&b':') || two_digits(b, 4)? > 59 {
                return None;
            }
            Some(6)
        }
        _ => None,
    }
}
