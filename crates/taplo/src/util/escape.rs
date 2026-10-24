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
/// \uHHHH     - unicode         (U+HHHH)
/// \UHHHHHHHH - unicode         (U+HHHHHHHH)
///
/// A backslash at the end of a line (only possible in multi-line strings)
/// trims all whitespace and newlines up to the next non-whitespace character.
///
/// Returns the unescaped character (`None` for a line ending backslash)
/// and the length of the sequence in bytes, without the backslash.
///
/// The input must start right after the backslash.
fn parse_escape(s: &str) -> Result<(Option<char>, usize), ()> {
    let c = s.chars().next().ok_or(())?;

    let unescaped = match c {
        'b' => '\u{0008}',
        't' => '\u{0009}',
        'n' => '\u{000A}',
        'f' => '\u{000C}',
        'r' => '\u{000D}',
        'e' => '\u{001B}',
        '"' => '\u{0022}',
        '\\' => '\u{005C}',
        'x' => return parse_hex_escape(s, 2),
        'u' => return parse_hex_escape(s, 4),
        'U' => return parse_hex_escape(s, 8),
        ' ' | '\t' | '\n' | '\r' => return parse_line_ending_backslash(s),
        _ => return Err(()),
    };

    Ok((Some(unescaped), 1))
}

fn parse_hex_escape(s: &str, digit_count: usize) -> Result<(Option<char>, usize), ()> {
    let digits = s.get(1..1 + digit_count).ok_or(())?;

    if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(());
    }

    let value = u32::from_str_radix(digits, 16).map_err(|_| ())?;
    let c = char::from_u32(value).ok_or(())?;

    Ok((Some(c), 1 + digit_count))
}

fn parse_line_ending_backslash(s: &str) -> Result<(Option<char>, usize), ()> {
    let rest = s.trim_start_matches([' ', '\t']);

    let rest = if let Some(rest) = rest.strip_prefix('\n') {
        rest
    } else if let Some(rest) = rest.strip_prefix("\r\n") {
        rest
    } else {
        return Err(());
    };

    let rest = rest.trim_start_matches([' ', '\t', '\n', '\r']);

    Ok((None, s.len() - rest.len()))
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
            // Other control characters are not allowed in strings.
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
    let mut rest = s;

    while let Some(backslash_idx) = rest.find('\\') {
        new_s += &rest[..backslash_idx];

        let escape_start = s.len() - rest.len() + backslash_idx;
        let (unescaped, len) =
            parse_escape(&rest[backslash_idx + 1..]).map_err(|_| escape_start)?;

        if let Some(c) = unescaped {
            new_s.push(c);
        }

        rest = &rest[backslash_idx + 1 + len..];
    }

    Ok(new_s + rest)
}

/// Same as unescape, but doesn't create a new
/// unescaped string, and returns all invalid escape indices.
pub fn check_escape(s: &str) -> Result<(), Vec<usize>> {
    let mut invalid = Vec::new();
    let mut rest = s;

    while let Some(backslash_idx) = rest.find('\\') {
        let after_backslash = &rest[backslash_idx + 1..];

        let len = match parse_escape(after_backslash) {
            Ok((_, len)) => len,
            Err(_) => {
                invalid.push(s.len() - rest.len() + backslash_idx);
                // Skip the character after the backslash as well,
                // so that an escaped backslash is not reported twice.
                after_backslash.chars().next().map_or(0, char::len_utf8)
            }
        };

        rest = &after_backslash[len..];
    }

    if invalid.is_empty() {
        Ok(())
    } else {
        Err(invalid)
    }
}
