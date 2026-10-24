use super::{DomNode, Node};
use crate::{
    dom::{error::Error, Entries, KeyOrIndex, Keys},
    syntax::{SyntaxElement, SyntaxKind},
    util::{escape, shared::Shared, unescape},
};
use once_cell::unsync::OnceCell;
use rowan::{NodeOrToken, TextRange};
use std::{
    fmt::Write,
    iter::once,
    sync::{atomic::AtomicBool, Arc},
};
use time::macros::format_description;

macro_rules! wrap_node {
    (
    $(#[$attrs:meta])*
    $vis:vis struct $name:ident {
        inner: $inner:ident
    }
    ) => {
        $(#[$attrs])*
        $vis struct $name {
            pub(crate) inner: Arc<$inner>,
        }

        impl $crate::private::Sealed for $name {}
        impl $crate::dom::node::DomNode for $name {
            fn syntax(&self) -> Option<&$crate::syntax::SyntaxElement> {
                self.inner.syntax.as_ref()
            }

            fn errors(&self) -> &$crate::util::shared::Shared<Vec<$crate::dom::error::Error>> {
                &self.inner.errors
            }

            fn validate_node(&self) -> Result<(), &$crate::util::shared::Shared<Vec<$crate::dom::error::Error>>> {
                self.validate_impl()
            }
        }

        impl $inner {
            #[allow(dead_code)]
            pub(crate) fn wrap(self) -> $name {
                self.into()
            }
        }

        impl From<$inner> for $name {
            fn from(inner: $inner) -> $name {
                $name {
                    inner: Arc::new(inner)
                }
            }
        }
    };
}

#[derive(Debug)]
pub(crate) struct TableInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) header: bool,
    pub(crate) kind: TableKind,
    pub(crate) entries: Shared<Entries>,
    /// Whether a pseudo-table that was created implicitly by a table header
    /// (e.g. `a` in `[a.b]`) has been defined by its own header (`[a]`) later.
    ///
    /// Such tables can be defined only once.
    pub(crate) defined_by_header: AtomicBool,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Table { inner: TableInner }
}

impl Table {
    pub fn get(&self, key: impl Into<Key>) -> Option<Node> {
        let key = key.into();
        let entries = self.inner.entries.read();
        entries.lookup.get(&key).cloned()
    }

    pub fn entries(&self) -> &Shared<Entries> {
        &self.inner.entries
    }

    pub fn kind(&self) -> TableKind {
        self.inner.kind
    }

    /// Add an entry and also collect errors on conflicts.
    pub(crate) fn add_entry(&self, key: Key, node: Node) {
        self.inner.entries.update(|entries| {
            if let Some((existing_key, value)) = entries.lookup.get_key_value(&key) {
                // Merge the two pseudo-tables together.
                if let (Node::Table(existing_table), Node::Table(new_table)) = (value, &node) {
                    if existing_table.inner.kind == TableKind::Pseudo
                        && new_table.inner.kind == TableKind::Pseudo
                    {
                        let new_entries = new_table.entries().read();
                        for (k, n) in new_entries.iter() {
                            if let Some(additional_syntax) = k.syntax() {
                                existing_key.inner.additional_syntaxes.update(|syntaxes| {
                                    syntaxes.push(additional_syntax.clone());
                                });
                            }

                            existing_table.add_entry(k.clone(), n.clone());
                        }
                        return;
                    }
                }

                self.inner.errors.update(|errors| {
                    errors.push(Error::ConflictingKeys {
                        key: key.clone(),
                        other: existing_key.clone(),
                    })
                });
            }

            entries.add(key, node);
        });
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableKind {
    Regular,
    Inline,
    Pseudo,
}

#[derive(Debug)]
pub(crate) struct KeyInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) is_valid: bool,
    pub(crate) value: OnceCell<String>,

    /// The same key can appear at multiple positions
    /// in a TOML document.
    ///
    /// # Example
    ///  
    /// In the following both `table` and `inner` appear multiple times
    /// despite being the same key in the DOM.
    ///
    /// ```toml
    /// [table.inner.something]
    /// [table.inner.something_else]
    /// ```
    pub(crate) additional_syntaxes: Shared<Vec<SyntaxElement>>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Key { inner: KeyInner }
}

impl<S> From<S> for Key
where
    S: Into<String>,
{
    fn from(s: S) -> Self {
        Key::new(s)
    }
}

impl Key {
    /// Return a new key with the given value.
    ///
    /// # Remarks
    ///
    /// This **does not** check or modify the input string.
    pub fn new(key: impl Into<String>) -> Self {
        KeyInner {
            errors: Default::default(),
            syntax: None,
            is_valid: true,
            value: OnceCell::from(key.into()),
            additional_syntaxes: Default::default(),
        }
        .wrap()
    }

    /// An unescaped value of the key.
    pub fn value(&self) -> &str {
        self.inner.value.get_or_init(|| {
            self.inner
                .syntax
                .as_ref()
                .and_then(NodeOrToken::as_token)
                .map(|s| {
                    if s.text().starts_with('\'') {
                        let string = s.text();
                        let string = string.strip_prefix('\'').unwrap_or(string);
                        let string = string.strip_suffix('\'').unwrap_or(string);
                        string.to_string()
                    } else if s.text().starts_with('"') {
                        let string = s.text();
                        let string = string.strip_prefix('"').unwrap_or(string);
                        let string = string.strip_suffix('"').unwrap_or(string);
                        match unescape(string) {
                            Ok(s) => s,
                            Err(_) => {
                                self.inner.errors.update(|errors| {
                                    errors.push(Error::InvalidEscapeSequence {
                                        string: s.clone().into(),
                                    })
                                });
                                String::new()
                            }
                        }
                    } else {
                        s.text().to_string()
                    }
                })
                .unwrap_or_default()
        })
    }

    pub fn text_ranges(&self) -> impl ExactSizeIterator<Item = TextRange> {
        let additional_syntaxes = self.inner.additional_syntaxes.read();

        let mut ranges = Vec::with_capacity(1 + additional_syntaxes.len());
        if let Some(s) = self.syntax() {
            ranges.push(s.text_range());
        }

        ranges.extend(additional_syntaxes.iter().map(|s| s.text_range()));

        ranges.into_iter()
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if !self.inner.is_valid {
            return Err(self.errors());
        }

        let _ = self.value();
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }

    pub fn join(&self, key: impl Into<KeyOrIndex>) -> Keys {
        Keys::new(once(self.clone().into()).chain(once(key.into())))
    }
}

impl AsRef<str> for Key {
    fn as_ref(&self) -> &str {
        self.value()
    }
}

impl core::fmt::Display for Key {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(s) = self.syntax() {
            return s.fmt(f);
        }

        let value = self.value();

        let is_bare = !value.is_empty()
            && value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');

        if is_bare {
            return value.fmt(f);
        }

        // Literal strings cannot contain apostrophes or control characters.
        if value.chars().all(|c| c != '\'' && (c == '\t' || !c.is_control())) {
            f.write_char('\'')?;
            value.fmt(f)?;
            f.write_char('\'')
        } else {
            f.write_char('"')?;
            escape(value).fmt(f)?;
            f.write_char('"')
        }
    }
}

impl PartialEq for Key {
    fn eq(&self, other: &Self) -> bool {
        if !self.inner.is_valid || !other.inner.is_valid {
            return false;
        }

        self.value().eq(other.value())
    }
}

impl Eq for Key {}

impl std::hash::Hash for Key {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        if !self.inner.is_valid {
            return 0.hash(state);
        }

        self.value().hash(state)
    }
}

#[derive(Debug)]
pub(crate) struct ArrayInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) kind: ArrayKind,
    pub(crate) items: Shared<Vec<Node>>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Array { inner: ArrayInner }
}

impl Array {
    pub fn items(&self) -> &Shared<Vec<Node>> {
        &self.inner.items
    }

    pub fn kind(&self) -> ArrayKind {
        self.inner.kind
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArrayKind {
    Tables,
    Inline,
}

impl ArrayKind {
    /// Returns `true` if the array kind is [`Tables`].
    ///
    /// [`Tables`]: ArrayKind::Tables
    pub fn is_tables(&self) -> bool {
        matches!(self, Self::Tables)
    }

    /// Returns `true` if the array kind is [`Inline`].
    ///
    /// [`Inline`]: ArrayKind::Inline
    pub fn is_inline(&self) -> bool {
        matches!(self, Self::Inline)
    }
}

#[derive(Debug)]
pub(crate) struct BoolInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) value: OnceCell<bool>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Bool { inner: BoolInner }
}

impl Bool {
    /// A boolean value.
    pub fn value(&self) -> bool {
        *self.inner.value.get_or_init(|| {
            self.syntax()
                .and_then(|s| s.as_token())
                .and_then(|s| s.text().parse().ok())
                .unwrap_or_default()
        })
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug)]
pub(crate) struct StrInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) repr: StrRepr,
    pub(crate) value: OnceCell<String>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Str { inner: StrInner }
}

impl Str {
    /// An unescaped value of the string.
    pub fn value(&self) -> &str {
        self.inner.value.get_or_init(|| {
            self.inner
                .syntax
                .as_ref()
                .map(|s| match self.inner.repr {
                    StrRepr::Basic => {
                        let string = s.as_token().unwrap().text();
                        let string = string.strip_prefix('"').unwrap_or(string);
                        let string = string.strip_suffix('"').unwrap_or(string);
                        match unescape(string) {
                            Ok(s) => s,
                            Err(_) => {
                                self.inner.errors.update(|errors| {
                                    errors.push(Error::InvalidEscapeSequence { string: s.clone() })
                                });
                                String::new()
                            }
                        }
                    }
                    StrRepr::Literal => {
                        let string = s.as_token().unwrap().text();
                        let string = string.strip_prefix('\'').unwrap_or(string);
                        let string = string.strip_suffix('\'').unwrap_or(string);
                        string.to_string()
                    }
                    StrRepr::MultiLine => {
                        let string = s.as_token().unwrap().text();
                        let string = string.strip_prefix(r#"""""#).unwrap_or(string);
                        let string = match string.strip_prefix("\r\n") {
                            Some(s) => s,
                            None => string.strip_prefix('\n').unwrap_or(string),
                        };
                        let string = string.strip_suffix(r#"""""#).unwrap_or(string);
                        match unescape(string) {
                            Ok(s) => s,
                            Err(_) => {
                                self.inner.errors.update(|errors| {
                                    errors.push(Error::InvalidEscapeSequence { string: s.clone() })
                                });
                                String::new()
                            }
                        }
                    }
                    StrRepr::MultiLineLiteral => {
                        let string = s.as_token().unwrap().text();
                        let string = string.strip_prefix(r#"'''"#).unwrap_or(string);
                        let string = match string.strip_prefix("\r\n") {
                            Some(s) => s,
                            None => string.strip_prefix('\n').unwrap_or(string),
                        };
                        let string = string.strip_suffix(r#"'''"#).unwrap_or(string);
                        string.to_string()
                    }
                })
                .unwrap_or_default()
        })
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        let _ = self.value();
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub enum StrRepr {
    Basic,
    MultiLine,
    Literal,
    MultiLineLiteral,
}

#[derive(Debug)]
pub(crate) struct IntegerInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) repr: IntegerRepr,
    pub(crate) value: OnceCell<IntegerValue>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Integer { inner: IntegerInner }
}

impl Integer {
    /// An integer value.
    pub fn value(&self) -> IntegerValue {
        *self.inner.value.get_or_init(|| {
            if let Some(s) = self.syntax().and_then(|s| s.as_token()) {
                let int_text = s.text().replace('_', "");

                match self.inner.repr {
                    IntegerRepr::Dec => {
                        if s.text().starts_with('-') {
                            IntegerValue::Negative(int_text.parse().unwrap_or_default())
                        } else {
                            IntegerValue::Positive(int_text.parse().unwrap_or_default())
                        }
                    }
                    IntegerRepr::Bin => IntegerValue::Positive(
                        u64::from_str_radix(int_text.trim_start_matches("0b"), 2)
                            .unwrap_or_default(),
                    ),
                    IntegerRepr::Oct => IntegerValue::Positive(
                        u64::from_str_radix(int_text.trim_start_matches("0o"), 8)
                            .unwrap_or_default(),
                    ),
                    IntegerRepr::Hex => IntegerValue::Positive(
                        u64::from_str_radix(int_text.trim_start_matches("0x"), 16)
                            .unwrap_or_default(),
                    ),
                }
            } else {
                IntegerValue::Positive(0)
            }
        })
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub enum IntegerRepr {
    Dec,
    Bin,
    Oct,
    Hex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntegerValue {
    Negative(i64),
    Positive(u64),
}

impl IntegerValue {
    /// Returns `true` if the integer value is [`Negative`].
    ///
    /// [`Negative`]: IntegerValue::Negative
    pub fn is_negative(&self) -> bool {
        matches!(self, Self::Negative(..))
    }

    /// Returns `true` if the integer value is [`Positive`].
    ///
    /// [`Positive`]: IntegerValue::Positive
    pub fn is_positive(&self) -> bool {
        matches!(self, Self::Positive(..))
    }

    pub fn as_negative(&self) -> Option<i64> {
        if let Self::Negative(v) = self {
            Some(*v)
        } else {
            None
        }
    }

    pub fn as_positive(&self) -> Option<u64> {
        if let Self::Positive(v) = self {
            Some(*v)
        } else {
            None
        }
    }
}

impl core::fmt::Display for IntegerValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IntegerValue::Negative(v) => v.fmt(f),
            IntegerValue::Positive(v) => v.fmt(f),
        }
    }
}

#[derive(Debug)]
pub(crate) struct FloatInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) value: OnceCell<f64>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Float { inner: FloatInner }
}

impl Float {
    /// A float value.
    pub fn value(&self) -> f64 {
        *self.inner.value.get_or_init(|| {
            if let Some(text) = self.syntax().and_then(|s| s.as_token()).map(|s| s.text()) {
                text.replace('_', "").replace("nan", "NaN").parse().unwrap()
            } else {
                0_f64
            }
        })
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        let _ = self.value();
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug)]
pub(crate) struct DateTimeInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
    pub(crate) value: OnceCell<DateTimeValue>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct DateTime { inner: DateTimeInner }
}

impl DateTime {
    pub fn value(&self) -> DateTimeValue {
        *self.inner.value.get_or_init(|| {
            self.syntax()
                .and_then(|s| s.as_token())
                .and_then(|token| DateTimeValue::from_token(token.kind(), token.text()))
                .unwrap_or(DateTimeValue::OffsetDateTime(
                    time::OffsetDateTime::UNIX_EPOCH,
                ))
        })
    }

    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Ord, PartialOrd)]
pub enum DateTimeValue {
    OffsetDateTime(time::OffsetDateTime),
    LocalDateTime(time::PrimitiveDateTime),
    Date(time::Date),
    Time(time::Time),
}

impl DateTimeValue {
    /// Parse the text of a date or time token of the given kind.
    ///
    /// Returns `None` if the text is not a valid value of the given kind,
    /// e.g. if any of the fields are out of range.
    pub(crate) fn from_token(kind: SyntaxKind, text: &str) -> Option<Self> {
        match kind {
            SyntaxKind::DATE_TIME_OFFSET => {
                let (date, rest) = parse_date(text)?;
                let (time, rest) = parse_time(strip_time_delimiter(rest)?)?;
                let offset = parse_offset(rest)?;
                Some(DateTimeValue::OffsetDateTime(
                    time::PrimitiveDateTime::new(date, time).assume_offset(offset),
                ))
            }
            SyntaxKind::DATE_TIME_LOCAL => {
                let (date, rest) = parse_date(text)?;
                let (time, rest) = parse_time(strip_time_delimiter(rest)?)?;
                rest.is_empty().then_some(DateTimeValue::LocalDateTime(
                    time::PrimitiveDateTime::new(date, time),
                ))
            }
            SyntaxKind::DATE => {
                let (date, rest) = parse_date(text)?;
                rest.is_empty().then_some(DateTimeValue::Date(date))
            }
            SyntaxKind::TIME => {
                let (time, rest) = parse_time(text)?;
                rest.is_empty().then_some(DateTimeValue::Time(time))
            }
            _ => None,
        }
    }
}

/// Parse a number with exactly `len` ASCII digits from the start of `s`.
fn parse_digits(s: &str, len: usize) -> Option<(u32, &str)> {
    let digits = s.get(..len)?;

    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }

    Some((digits.parse().ok()?, &s[len..]))
}

/// `YYYY-MM-DD`
fn parse_date(s: &str) -> Option<(time::Date, &str)> {
    let (year, s) = parse_digits(s, 4)?;
    let (month, s) = parse_digits(s.strip_prefix('-')?, 2)?;
    let (day, s) = parse_digits(s.strip_prefix('-')?, 2)?;

    let month = time::Month::try_from(u8::try_from(month).ok()?).ok()?;
    let date = time::Date::from_calendar_date(year as i32, month, u8::try_from(day).ok()?).ok()?;

    Some((date, s))
}

fn strip_time_delimiter(s: &str) -> Option<&str> {
    s.strip_prefix(['T', 't', ' '])
}

/// `HH:MM[:SS[.fraction]]`, seconds are optional since TOML 1.1.
fn parse_time(s: &str) -> Option<(time::Time, &str)> {
    let (hour, s) = parse_digits(s, 2)?;
    let (minute, mut s) = parse_digits(s.strip_prefix(':')?, 2)?;

    let mut second = 0;
    let mut nanosecond = 0;

    if let Some(rest) = s.strip_prefix(':') {
        let (sec, rest) = parse_digits(rest, 2)?;
        second = sec;
        s = rest;

        if let Some(rest) = s.strip_prefix('.') {
            let fraction_len = rest.bytes().take_while(u8::is_ascii_digit).count();

            if fraction_len == 0 {
                return None;
            }

            // Precision beyond nanoseconds is truncated.
            for (i, b) in rest.bytes().take(fraction_len.min(9)).enumerate() {
                nanosecond += u32::from(b - b'0') * 10_u32.pow(8 - i as u32);
            }

            s = &rest[fraction_len..];
        }
    }

    let time = time::Time::from_hms_nano(
        u8::try_from(hour).ok()?,
        u8::try_from(minute).ok()?,
        u8::try_from(second).ok()?,
        nanosecond,
    )
    .ok()?;

    Some((time, s))
}

/// `Z` or `+HH:MM` or `-HH:MM`
fn parse_offset(s: &str) -> Option<time::UtcOffset> {
    if s == "Z" || s == "z" {
        return Some(time::UtcOffset::UTC);
    }

    let (sign, s) = if let Some(s) = s.strip_prefix('+') {
        (1, s)
    } else {
        (-1, s.strip_prefix('-')?)
    };

    let (hour, s) = parse_digits(s, 2)?;
    let (minute, s) = parse_digits(s.strip_prefix(':')?, 2)?;

    if !s.is_empty() || hour > 23 || minute > 59 {
        return None;
    }

    time::UtcOffset::from_hms(sign * hour as i8, sign * minute as i8, 0).ok()
}

impl core::fmt::Display for DateTimeValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DateTimeValue::OffsetDateTime(dt) => dt
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap()
                .fmt(f),
            DateTimeValue::LocalDateTime(dt) => dt
                .format(if dt.time().nanosecond() > 0 {
                    &format_description!(
                        "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond]"
                    )
                } else {
                    &format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]")
                })
                .unwrap()
                .fmt(f),
            DateTimeValue::Date(date) => date
                .format(&format_description!("[year]-[month]-[day]"))
                .unwrap()
                .fmt(f),
            DateTimeValue::Time(time) => time
                .format(if time.nanosecond() > 0 {
                    &format_description!("[hour]:[minute]:[second].[subsecond]")
                } else {
                    &format_description!("[hour]:[minute]:[second]")
                })
                .unwrap()
                .fmt(f),
        }
    }
}

#[derive(Debug)]
pub(crate) struct InvalidInner {
    pub(crate) errors: Shared<Vec<Error>>,
    pub(crate) syntax: Option<SyntaxElement>,
}

wrap_node! {
    #[derive(Debug, Clone)]
    pub struct Invalid { inner: InvalidInner }
}

impl Invalid {
    fn validate_impl(&self) -> Result<(), &Shared<Vec<Error>>> {
        if self.errors().read().as_ref().is_empty() {
            Ok(())
        } else {
            Err(self.errors())
        }
    }
}
