use std::{fmt::Write, ops::Range};

/// Escaping based on:
///
/// \b         - backspace       (U+0008)
/// \t         - tab             (U+0009)
/// \e         - escape          (U+001B)
/// \n         - linefeed        (U+000A)
/// \f         - form feed       (U+000C)
/// \r         - carriage return (U+000D)
/// \"         - quote           (U+0022)
/// \\         - backslash       (U+005C)
/// \xHH       - unicode         (U+00HH)
/// \uXXXX     - unicode         (U+XXXX)
/// \UXXXXXXXX - unicode         (U+XXXXXXXX)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Escape {
    Backspace,
    Tab,
    Esc,
    /// Line ending backslash, the whitespace and newlines after it are trimmed.
    Newline,
    LineFeed,
    FormFeed,
    CarriageReturn,
    Quote,
    Backslash,
    Hex,
    Unicode,
    UnicodeLarge,
    Unknown,
    UnEscaped,
}

/// A hand-written lexer for escape sequences,
/// as a Logos lexer cannot backtrack from partial matches like `\ x`.
struct Lexer<'s> {
    source: &'s str,
    start: usize,
    end: usize,
}

impl<'s> Lexer<'s> {
    fn new(source: &'s str) -> Self {
        Self {
            source,
            start: 0,
            end: 0,
        }
    }

    fn slice(&self) -> &'s str {
        &self.source[self.start..self.end]
    }

    fn span(&self) -> Range<usize> {
        self.start..self.end
    }

    fn remainder(&self) -> &'s str {
        &self.source[self.end..]
    }

    fn next(&mut self) -> Option<Escape> {
        let rest = self.remainder();
        if rest.is_empty() {
            return None;
        }

        let (token, len) = if rest.starts_with('\\') {
            lex_escape(rest)
        } else {
            (UnEscaped, rest.find('\\').unwrap_or(rest.len()))
        };

        self.start = self.end;
        self.end += len;
        Some(token)
    }
}

/// Returns the escape sequence at the start of `s`, and its length in bytes.
///
/// `s` must start with a backslash.
fn lex_escape(s: &str) -> (Escape, usize) {
    let is_ws = |c: char| c == ' ' || c == '\t';
    let hex = |token: Escape, digits: usize| match s.get(2..2 + digits) {
        Some(d) if d.chars().all(|c| c.is_ascii_hexdigit()) => (token, 2 + digits),
        _ => (Unknown, 2),
    };

    match s[1..].chars().next() {
        Some('b') => (Backspace, 2),
        Some('t') => (Tab, 2),
        Some('e') => (Esc, 2),
        Some('n') => (LineFeed, 2),
        Some('f') => (FormFeed, 2),
        Some('r') => (CarriageReturn, 2),
        Some('"') => (Quote, 2),
        Some('\\') => (Backslash, 2),
        Some('x') => hex(Hex, 2),
        Some('u') => hex(Unicode, 4),
        Some('U') => hex(UnicodeLarge, 8),
        Some(' ' | '\t' | '\r' | '\n') => {
            let newline_start = s[1..].find(|c| !is_ws(c)).map_or(s.len(), |i| i + 1);
            let after_ws = &s[newline_start..];
            let newline_len = if after_ws.starts_with('\n') {
                1
            } else if after_ws.starts_with("\r\n") {
                2
            } else {
                return (Unknown, 2);
            };

            let trimmed_start = newline_start + newline_len;
            let len = s[trimmed_start..]
                .find(|c| !is_ws(c) && c != '\n' && c != '\r')
                .map_or(s.len(), |i| trimmed_start + i);
            (Newline, len)
        }
        Some(c) => (Unknown, 1 + c.len_utf8()),
        None => (Unknown, 1),
    }
}

use Escape::*;

/// Escape values in a given string.
pub fn escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());

    for c in s.chars() {
        match c {
            '\u{0008}' => escaped.push_str(r#"\b"#),
            '\u{0009}' => escaped.push_str(r#"\t"#),
            '\u{000A}' => escaped.push_str(r#"\n"#),
            '\u{000C}' => escaped.push_str(r#"\f"#),
            '\u{000D}' => escaped.push_str(r#"\r"#),
            '\u{0022}' => escaped.push_str(r#"\""#),
            '\u{005C}' => escaped.push_str(r#"\\"#),
            // Other control characters are not allowed unescaped in basic strings.
            '\u{0000}'..='\u{001F}' | '\u{007F}' => {
                let _ = write!(escaped, "\\u{:04X}", c as u32);
            }
            _ => {
                escaped.push(c);
            }
        }
    }

    escaped
}

/// Unescape all supported sequences found in [Escape](Escape).
///
/// If it fails, the index of failure is returned.
pub fn unescape(s: &str) -> Result<String, usize> {
    let mut new_s = String::with_capacity(s.len());
    let mut lexer = Lexer::new(s);

    while let Some(t) = lexer.next() {
        match t {
            Backspace => new_s += "\u{0008}",
            Tab => new_s += "\u{0009}",
            Esc => new_s += "\u{001B}",
            LineFeed => new_s += "\u{000A}",
            FormFeed => new_s += "\u{000C}",
            CarriageReturn => new_s += "\u{000D}",
            Quote => new_s += "\u{0022}",
            Backslash => new_s += "\u{005C}",
            Newline => {}
            Hex => {
                new_s.push(char::from(
                    u8::from_str_radix(&lexer.slice()[2..], 16).map_err(|_| lexer.span().start)?,
                ));
            }
            Unicode => {
                new_s += &std::char::from_u32(
                    u32::from_str_radix(&lexer.slice()[2..], 16).map_err(|_| lexer.span().start)?,
                )
                .ok_or(lexer.span().start)?
                .to_string();
            }
            UnicodeLarge => {
                new_s += &std::char::from_u32(
                    u32::from_str_radix(&lexer.slice()[2..], 16).map_err(|_| lexer.span().start)?,
                )
                .ok_or(lexer.span().start)?
                .to_string();
            }
            Unknown => return Err(lexer.span().end),
            UnEscaped => {
                new_s += lexer.slice();
            }
        }
    }

    Ok(new_s + lexer.remainder())
}

/// Same as unescape, but doesn't create a new
/// unescaped string, and returns all invalid escape indices.
pub fn check_escape(s: &str) -> Result<(), Vec<usize>> {
    let mut lexer = Lexer::new(s);
    let mut invalid = Vec::new();

    while let Some(t) = lexer.next() {
        match t {
            Backspace => {}
            Tab => {}
            Esc => {}
            LineFeed => {}
            FormFeed => {}
            CarriageReturn => {}
            Quote => {}
            Backslash => {}
            Newline => {}
            Hex => {}
            Unicode => {
                let char_val = match u32::from_str_radix(&lexer.slice()[2..], 16) {
                    Ok(v) => v,
                    Err(_) => {
                        invalid.push(lexer.span().start);
                        continue;
                    }
                };

                match std::char::from_u32(char_val) {
                    None => {
                        invalid.push(lexer.span().start);
                    }
                    Some(_) => {}
                };
            }
            UnicodeLarge => {
                let char_val = match u32::from_str_radix(&lexer.slice()[2..], 16) {
                    Ok(v) => v,
                    Err(_) => {
                        invalid.push(lexer.span().start);
                        continue;
                    }
                };

                match std::char::from_u32(char_val) {
                    None => {
                        invalid.push(lexer.span().start);
                    }
                    Some(_) => {}
                };
            }
            Unknown => invalid.push(lexer.span().start),
            UnEscaped => {}
        }
    }

    if invalid.is_empty() {
        Ok(())
    } else {
        Err(invalid)
    }
}
