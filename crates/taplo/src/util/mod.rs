use crate::syntax::{SyntaxElement, SyntaxKind, SyntaxNode};
use rowan::TextRange;
use rowan::TextSize;

pub(crate) mod iter;
pub(crate) mod shared;

mod escape;
pub mod syntax;

pub use escape::check_escape;
pub use escape::{escape, unescape};

pub(crate) mod allowed_chars {
    //! Character validation of comments and strings.
    //!
    //! The returned indices are byte offsets of the invalid characters.

    /// Control characters other than tab are not allowed
    /// in comments and strings.
    fn is_disallowed_control(c: char) -> bool {
        matches!(c, '\u{0000}'..='\u{0008}' | '\u{000A}'..='\u{001F}' | '\u{007F}')
    }

    fn check(s: &str, allow_newlines: bool) -> Result<(), Vec<usize>> {
        let mut err_indices = Vec::new();

        let mut chars = s.char_indices().peekable();
        while let Some((i, c)) = chars.next() {
            if allow_newlines {
                if c == '\n' {
                    continue;
                }

                // Only CRLF is allowed, a lone CR is not a newline.
                if c == '\r' && matches!(chars.peek(), Some((_, '\n'))) {
                    continue;
                }
            }

            if is_disallowed_control(c) {
                err_indices.push(i);
            }
        }

        if err_indices.is_empty() {
            Ok(())
        } else {
            Err(err_indices)
        }
    }

    pub(crate) fn comment(s: &str) -> Result<(), Vec<usize>> {
        check(s, false)
    }

    pub(crate) fn string(s: &str) -> Result<(), Vec<usize>> {
        check(s, false)
    }

    pub(crate) fn multi_line_string(s: &str) -> Result<(), Vec<usize>> {
        check(s, true)
    }

    pub(crate) fn string_literal(s: &str) -> Result<(), Vec<usize>> {
        check(s, false)
    }

    pub(crate) fn multi_line_string_literal(s: &str) -> Result<(), Vec<usize>> {
        check(s, true)
    }
}

pub trait StrExt {
    fn strip_quotes(self) -> Self;
}

impl StrExt for &str {
    fn strip_quotes(self) -> Self {
        if self.starts_with('\"') || self.starts_with('\'') {
            &self[1..self.len() - 1]
        } else {
            self
        }
    }
}

/// Utility extension methods for Syntax Nodes.
pub trait SyntaxExt {
    /// Return a syntax node that contains the given offset.
    fn find_node(&self, offset: TextSize, inclusive: bool) -> Option<SyntaxNode>;

    /// Find the deepest node that contains the given offset.
    fn find_node_deep(&self, offset: TextSize, inclusive: bool) -> Option<SyntaxNode> {
        let mut node = self.find_node(offset, inclusive);
        while let Some(n) = &node {
            let new_node = n.find_node(offset, inclusive);
            if new_node.is_some() {
                node = new_node;
            } else {
                break;
            }
        }

        node
    }

    /// Find a node or token by its kind.
    fn find(&self, kind: SyntaxKind) -> Option<SyntaxElement>;
}

impl SyntaxExt for SyntaxNode {
    fn find_node(&self, offset: TextSize, inclusive: bool) -> Option<SyntaxNode> {
        for d in self.descendants().skip(1) {
            let range = d.text_range();

            if (inclusive && range.contains_inclusive(offset)) || range.contains(offset) {
                return Some(d);
            }
        }

        None
    }

    fn find(&self, kind: SyntaxKind) -> Option<SyntaxElement> {
        self.descendants_with_tokens().find(|d| d.kind() == kind)
    }
}

pub fn join_ranges<I: IntoIterator<Item = TextRange>>(ranges: I) -> TextRange {
    ranges
        .into_iter()
        .fold(None, |ranges, range| match ranges {
            Some(r) => Some(range.cover(r)),
            None => Some(range),
        })
        .unwrap()
}

pub fn try_join_ranges<I: IntoIterator<Item = TextRange>>(ranges: I) -> Option<TextRange> {
    ranges.into_iter().fold(None, |ranges, range| match ranges {
        Some(r) => Some(range.cover(r)),
        None => Some(range),
    })
}

pub fn overlaps(range: TextRange, other: TextRange) -> bool {
    range.contains_range(other)
        || other.contains_range(range)
        || range.contains(other.start())
        || range.contains(other.end())
        || other.contains(range.start())
        || other.contains(range.end())
}
