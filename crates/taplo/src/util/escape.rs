/// Escaping based on:
///
/// \b         - backspace       (U+0008)
/// \t         - tab             (U+0009)
/// \n         - linefeed        (U+000A)
/// \f         - form feed       (U+000C)
/// \r         - carriage return (U+000D)
/// \e         - escape          (U+001B)
/// \"         - quote           (U+0022)
/// \\         - backslash       (U+005C)
/// \xHH       - unicode         (U+00HH)
/// \uXXXX     - unicode         (U+XXXX)
/// \UXXXXXXXX - unicode         (U+XXXXXXXX)
///
/// And line ending backslashes in multi-line strings.
enum Escape {
    Char(char),
    /// A line ending backslash, the backslash, the newline and all the following
    /// whitespace and newlines are trimmed.
    LineEnding,
}

/// Decode the escape sequence that starts with the backslash at `start`.
///
/// Returns the decoded escape and the end offset of the sequence,
/// or `None` if the escape sequence is invalid.
fn decode_escape(s: &str, start: usize) -> Option<(Escape, usize)> {
    let bytes = s.as_bytes();
    debug_assert_eq!(bytes.get(start), Some(&b'\\'));

    let c = match *bytes.get(start + 1)? {
        b'b' => '\u{0008}',
        b't' => '\u{0009}',
        b'n' => '\u{000A}',
        b'f' => '\u{000C}',
        b'r' => '\u{000D}',
        b'e' => '\u{001B}',
        b'"' => '\u{0022}',
        b'\\' => '\u{005C}',
        b'x' => return decode_hex(s, start, 2),
        b'u' => return decode_hex(s, start, 4),
        b'U' => return decode_hex(s, start, 8),
        b' ' | b'\t' | b'\n' | b'\r' => {
            let mut idx = start + 1;

            while matches!(bytes.get(idx), Some(b' ' | b'\t')) {
                idx += 1;
            }

            match newline_len(bytes, idx) {
                0 => return None,
                len => idx += len,
            }

            loop {
                if matches!(bytes.get(idx), Some(b' ' | b'\t')) {
                    idx += 1;
                    continue;
                }

                match newline_len(bytes, idx) {
                    0 => break,
                    len => idx += len,
                }
            }

            return Some((Escape::LineEnding, idx));
        }
        _ => return None,
    };

    Some((Escape::Char(c), start + 2))
}

fn newline_len(bytes: &[u8], idx: usize) -> usize {
    match bytes.get(idx..) {
        Some([b'\n', ..]) => 1,
        Some([b'\r', b'\n', ..]) => 2,
        _ => 0,
    }
}

fn decode_hex(s: &str, start: usize, digits: usize) -> Option<(Escape, usize)> {
    let hex = s.get(start + 2..start + 2 + digits)?;

    if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }

    let c = char::from_u32(u32::from_str_radix(hex, 16).ok()?)?;
    Some((Escape::Char(c), start + 2 + digits))
}

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
            // Other control characters are not allowed in strings,
            // `\u` is used instead of the shorter TOML 1.1 escapes
            // so that the output is also valid TOML 1.0.
            '\u{0000}'..='\u{001F}' | '\u{007F}' => {
                escaped.push_str(&format!(r#"\u{:04X}"#, c as u32));
            }
            _ => {
                escaped.push(c);
            }
        }
    }

    escaped
}

/// Unescape all supported escape sequences.
///
/// If it fails, the index of failure is returned.
pub fn unescape(s: &str) -> Result<String, usize> {
    let mut new_s = String::with_capacity(s.len());
    let mut idx = 0;

    while let Some(offset) = s[idx..].find('\\') {
        let start = idx + offset;
        new_s += &s[idx..start];

        let (escape, end) = decode_escape(s, start).ok_or(start)?;

        if let Escape::Char(c) = escape {
            new_s.push(c);
        }

        idx = end;
    }

    Ok(new_s + &s[idx..])
}

/// Same as unescape, but doesn't create a new
/// unescaped string, and returns all invalid escape indices.
pub fn check_escape(s: &str) -> Result<(), Vec<usize>> {
    let mut invalid = Vec::new();
    let mut idx = 0;

    while let Some(offset) = s[idx..].find('\\') {
        let start = idx + offset;

        match decode_escape(s, start) {
            Some((_, end)) => idx = end,
            None => {
                invalid.push(start);
                // Skip the backslash and the character after it.
                idx = start + 1;
                if let Some(c) = s[idx..].chars().next() {
                    idx += c.len_utf8();
                }
            }
        }
    }

    if invalid.is_empty() {
        Ok(())
    } else {
        Err(invalid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unescape_toml_1_1_escapes() {
        assert_eq!(unescape(r#"\e[0m"#).unwrap(), "\u{1B}[0m");
        assert_eq!(
            unescape(r#"\x00\x61\xE9\xff"#).unwrap(),
            "\u{0}a\u{E9}\u{FF}"
        );
        assert_eq!(unescape(r#"aé\U0001F600"#).unwrap(), "a\u{E9}\u{1F600}");
    }

    #[test]
    fn unescape_line_ending_backslash() {
        assert_eq!(unescape("a \\\n   b").unwrap(), "a b");
        assert_eq!(unescape("a \\  \r\n\n \t\r\n  b").unwrap(), "a b");
        assert_eq!(unescape("a\\\n").unwrap(), "a");
    }

    #[test]
    fn invalid_escapes() {
        for s in [
            r#"\x"#,
            r#"\x0"#,
            r#"\xg0"#,
            r#"\x_0"#,
            r#"\u00_1"#,
            r#"\uD800"#,
            r#"\U00110000"#,
            r#"\a"#,
            r#"\ a"#,
            r#"\"#,
            "\\\u{3000}\n",
        ] {
            assert!(unescape(s).is_err(), "{s:?}");
            assert!(check_escape(s).is_err(), "{s:?}");
        }
    }

    #[test]
    fn check_escape_reports_all_invalid() {
        assert_eq!(check_escape(r#"\q \e \x4 \é"#), Err(vec![0, 6, 10]));
    }

    #[test]
    fn escape_control_characters() {
        let s = "\u{0}\u{1B}\u{7F}\t\"é";
        assert_eq!(escape(s), r#"\u0000\u001B\u007F\t\"é"#);
        assert_eq!(unescape(&escape(s)).unwrap(), s);
    }
}
