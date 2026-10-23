import { Token, TokenType } from '../../lexer/token.js';
import { keywords } from './hana.keywords.js';

const keywordSet = new Set(keywords);

/**
 * Post-processing of SAP HANA tokens:
 *
 * - splits "1..10" into "1", "..", "10"
 * - converts built-in functions that are also keywords to keywords when not followed by "("
 * - converts clause keywords to plain keywords where they don't start a clause
 * - detects SQLScript blocks (BEGIN ... END, IF ... END IF, WHILE ... END WHILE etc.)
 */
export function postProcess(tokens: Token[]): Token[] {
  return demoteClauses(detectBlocks(functionNamesToKeywords(splitRangeOperators(tokens))));
}

const isComment = (t: Token): boolean =>
  t.type === TokenType.BLOCK_COMMENT ||
  t.type === TokenType.LINE_COMMENT ||
  t.type === TokenType.DISABLE_COMMENT;

const nextIndex = (tokens: Token[], index: number, dir: -1 | 1 = 1): number => {
  let i = index + dir;
  while (tokens[i] && isComment(tokens[i])) {
    i += dir;
  }
  return i;
};

const isKeyword = (token: Token | undefined, ...words: string[]): boolean =>
  token !== undefined &&
  (token.type === TokenType.RESERVED_KEYWORD || token.type === TokenType.RESERVED_KEYWORD_PHRASE) &&
  words.includes(token.text);

const isOpenParen = (token: Token | undefined): boolean =>
  token?.type === TokenType.OPEN_PAREN && token.text === '(';

const isPropertyAccess = (token: Token | undefined): boolean =>
  token?.type === TokenType.PROPERTY_ACCESS_OPERATOR;

const withType = (token: Token, type: TokenType): Token => ({ ...token, type });

/**
 * The range operator of FOR loop gets tokenized as two numbers when written without spaces:
 * "1..10" becomes "1." and ".10". Split these into "1", "..", "10".
 */
function splitRangeOperators(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      token.raw.endsWith('.') &&
      next &&
      next.start === token.start + token.raw.length &&
      ((next.type === TokenType.NUMBER && next.raw.startsWith('.')) ||
        (next.type === TokenType.PROPERTY_ACCESS_OPERATOR && next.raw === '.'))
    ) {
      const number = token.raw.slice(0, -1);
      result.push({ ...token, raw: number, text: number });
      result.push({
        type: TokenType.OPERATOR,
        raw: '..',
        text: '..',
        start: token.start + number.length,
      });
      if (next.type === TokenType.NUMBER) {
        const rest = next.raw.slice(1);
        result.push({ ...next, raw: rest, text: rest, start: next.start + 1 });
      }
      i++;
    } else {
      result.push(token);
    }
  }
  return result;
}

/**
 * Words like CURRENT_DATE and LANGUAGE are both built-in functions and keywords.
 * When not called as a function, treat them as keywords.
 */
function functionNamesToKeywords(tokens: Token[]): Token[] {
  return tokens.map((token, i) => {
    if (
      token.type === TokenType.RESERVED_FUNCTION_NAME &&
      keywordSet.has(token.text) &&
      !isOpenParen(tokens[nextIndex(tokens, i)])
    ) {
      return withType(token, TokenType.RESERVED_KEYWORD);
    }
    return token;
  });
}

// Statements in which SELECT, INSERT, FROM etc. don't start clauses
const nonClauseStatements = ['GRANT', 'REVOKE', 'IMPORT'];

// Tokens after which a new statement starts
const isStatementSeparator = (token: Token | undefined): boolean =>
  token === undefined ||
  token.type === TokenType.DELIMITER ||
  token.type === TokenType.BLOCK_START ||
  token.type === TokenType.BLOCK_MIDDLE;

interface ParenScope {
  isFunctionCall: boolean;
  hasSelect: boolean;
}

/**
 * Converts RESERVED_CLAUSE tokens to RESERVED_KEYWORD (or RESERVED_FUNCTION_NAME)
 * in places where they don't start a clause.
 */
function demoteClauses(tokens: Token[]): Token[] {
  const parens: ParenScope[] = [];
  let statementStart: Token | undefined;
  let hasSelect = false;
  let hasSignal = false;
  // Count of open CASE ... END inside CASE JOIN
  let caseJoinDepth = 0;

  return tokens.map((token, i) => {
    if (isComment(token)) {
      return token;
    }
    const prev = tokens[nextIndex(tokens, i, -1)];
    const next = tokens[nextIndex(tokens, i)];

    if (isStatementSeparator(prev)) {
      statementStart = token;
      hasSelect = false;
      hasSignal = false;
      caseJoinDepth = 0;
    }
    const isNonClauseStatement = nonClauseStatements.some(word => isKeyword(statementStart, word));

    switch (token.type) {
      case TokenType.OPEN_PAREN:
        parens.push({
          isFunctionCall: prev?.type === TokenType.RESERVED_FUNCTION_NAME,
          hasSelect: false,
        });
        return token;
      case TokenType.CLOSE_PAREN:
        parens.pop();
        return token;
      case TokenType.RESERVED_KEYWORD:
        if (token.text === 'SIGNAL' || token.text === 'RESIGNAL') {
          hasSignal = true;
        }
        return token;
      case TokenType.RESERVED_SELECT:
        if (isNonClauseStatement) {
          return withType(token, TokenType.RESERVED_KEYWORD);
        }
        hasSelect = true;
        if (parens.length > 0) {
          parens[parens.length - 1].hasSelect = true;
        }
        return token;
      case TokenType.RESERVED_JOIN:
        if (/\bCASE JOIN$/u.test(token.text)) {
          caseJoinDepth = 1;
        }
        return token;
      case TokenType.CASE:
        if (caseJoinDepth > 0) {
          caseJoinDepth++;
        }
        return token;
      case TokenType.END:
        if (caseJoinDepth > 0) {
          caseJoinDepth--;
        }
        return token;
      case TokenType.OR:
        // CREATE TRIGGER ... AFTER INSERT OR UPDATE ON tbl
        if (isTriggerEvent(next)) {
          return withType(token, TokenType.RESERVED_KEYWORD);
        }
        return token;
      case TokenType.RESERVED_CLAUSE:
        break;
      default:
        return token;
    }

    if (isPropertyAccess(prev) || isPropertyAccess(next)) {
      return token;
    }
    const paren = parens[parens.length - 1];

    if (
      isNonClauseStatement ||
      // TRIM(BOTH ' ' FROM x), STRING_AGG(x, ',' ORDER BY y)
      (paren?.isFunctionCall && !paren.hasSelect) ||
      // WITH that doesn't begin a common table expression
      (token.text === 'WITH' && !isCommonTableExpression(tokens, i)) ||
      // SELECT ... INTO, but not FETCH ... INTO or EXEC ... INTO
      (token.text === 'INTO' && !hasSelect) ||
      // PARTITION 1 <= VALUES < 10
      (token.text === 'VALUES' && prev?.type === TokenType.OPERATOR) ||
      // SIGNAL ... SET MESSAGE_TEXT = '...'
      (token.text === 'SET' && hasSignal) ||
      // CREATE TRIGGER ... AFTER INSERT OR UPDATE OF col OR DELETE ON tbl
      (isTriggerEvent(token) &&
        (isKeyword(prev, 'BEFORE', 'AFTER', 'OF') || prev?.type === TokenType.OR)) ||
      // LEFT OUTER MANY TO ONE CASE JOIN WHEN ... THEN RETURN ... FROM ... ON ... END
      caseJoinDepth > 0
    ) {
      return withType(token, TokenType.RESERVED_KEYWORD);
    }

    // REPLACE statement vs REPLACE() function
    if (token.text === 'REPLACE') {
      if (isOpenParen(next)) {
        return withType(token, TokenType.RESERVED_FUNCTION_NAME);
      }
      if (statementStart !== token) {
        return withType(token, TokenType.RESERVED_KEYWORD);
      }
    }
    return token;
  });
}

const isTriggerEvent = (token: Token | undefined): boolean =>
  token !== undefined &&
  ['INSERT', 'UPDATE', 'DELETE'].includes(token.text) &&
  (token.type === TokenType.RESERVED_CLAUSE || token.type === TokenType.RESERVED_KEYWORD);

// WITH <name> AS (...) or WITH <name> (<columns>) AS (...)
function isCommonTableExpression(tokens: Token[], withIndex: number): boolean {
  const nameIndex = nextIndex(tokens, withIndex);
  const name = tokens[nameIndex];
  const afterName = tokens[nextIndex(tokens, nameIndex)];
  if (!name || !afterName) {
    return false;
  }
  if (isKeyword(afterName, 'AS')) {
    return true;
  }
  return (
    isOpenParen(afterName) &&
    (name.type === TokenType.IDENTIFIER || name.type === TokenType.QUOTED_IDENTIFIER)
  );
}

type FrameKind = 'paren' | 'case' | 'begin' | 'if' | 'while' | 'for' | 'loop';

interface Frame {
  kind: FrameKind;
  // True while in the header of IF, WHILE or FOR (before THEN or DO)
  inHeader: boolean;
  // Token types to assign when the frame gets properly closed
  edits: [number, TokenType][];
}

/**
 * Detects SQLScript blocks and marks their keywords with BLOCK_START, BLOCK_MIDDLE and BLOCK_END:
 *
 *   BEGIN ... END
 *   IF ... THEN ... ELSEIF ... THEN ... ELSE ... END IF
 *   WHILE ... DO ... END WHILE
 *   FOR ... DO ... END FOR
 *   LOOP ... END LOOP
 *
 * Only blocks that are properly closed get marked.
 * For IF, the THEN ... ELSEIF part is a block of its own, so the result is:
 *
 *   IF <cond> {THEN ... ELSEIF} <cond> {THEN ... ELSE ... END} IF
 */
function detectBlocks(tokens: Token[]): Token[] {
  const stack: Frame[] = [];
  const types = new Map<number, TokenType>();
  // Indexes of keywords after which a new statement starts
  const blockStarts = new Set<number>();
  // DECLARE ... HANDLER FOR <condition> <statement>
  let inHandlerDeclaration = false;

  const top = (): Frame | undefined => stack[stack.length - 1];
  const topIs = (...kinds: FrameKind[]): boolean => {
    const frame = top();
    return frame !== undefined && kinds.includes(frame.kind);
  };
  const openBlock = (kind: FrameKind, i: number) => {
    stack.push({ kind, inHeader: false, edits: [[i, TokenType.BLOCK_START]] });
    blockStarts.add(i);
  };
  const openHeader = (kind: FrameKind) => {
    stack.push({ kind, inHeader: true, edits: [] });
  };
  const closeBlock = (frame: Frame, i: number) => {
    stack.pop();
    frame.edits.push([i, TokenType.BLOCK_END]);
    frame.edits.forEach(([index, type]) => types.set(index, type));
  };

  tokens.forEach((token, i) => {
    if (isComment(token)) {
      return;
    }
    const frame = top();

    switch (token.type) {
      case TokenType.OPEN_PAREN:
        stack.push({ kind: 'paren', inHeader: false, edits: [] });
        return;
      case TokenType.CLOSE_PAREN:
        // Discard all blocks that were not closed inside the parenthesis
        if (stack.some(f => f.kind === 'paren')) {
          while (stack.pop()?.kind !== 'paren') {
            // continue popping
          }
        }
        return;
      case TokenType.DELIMITER:
        inHandlerDeclaration = false;
        // Discard IF, WHILE or FOR that never reached its THEN or DO
        if (frame?.inHeader) {
          stack.pop();
        }
        return;
    }

    const prevIndex = nextIndex(tokens, i, -1);
    const prev = tokens[prevIndex];
    const next = tokens[nextIndex(tokens, i)];
    // Keywords used as names, like tbl.end
    if (isPropertyAccess(prev) || isPropertyAccess(next)) {
      return;
    }
    const isStatementStart =
      prev === undefined ||
      prev.type === TokenType.DELIMITER ||
      blockStarts.has(prevIndex) ||
      (inHandlerDeclaration && !isKeyword(prev, 'HANDLER'));

    switch (token.type) {
      case TokenType.CASE:
        stack.push({ kind: 'case', inHeader: false, edits: [] });
        return;
      case TokenType.RESERVED_JOIN:
        // LEFT OUTER MANY TO ONE CASE JOIN ... END
        if (/\bCASE JOIN$/u.test(token.text)) {
          stack.push({ kind: 'case', inHeader: false, edits: [] });
        }
        return;
      case TokenType.THEN:
        if (frame?.kind === 'if' && frame.inHeader) {
          frame.inHeader = false;
          frame.edits.push([i, TokenType.BLOCK_START]);
          blockStarts.add(i);
        }
        return;
      case TokenType.ELSE:
        if (frame?.kind === 'if' && !frame.inHeader) {
          frame.edits.push([i, TokenType.BLOCK_MIDDLE]);
          blockStarts.add(i);
        }
        return;
      case TokenType.END:
        if (frame?.kind === 'case') {
          stack.pop();
        } else if (frame && !frame.inHeader && isMatchingEnd(frame.kind, next)) {
          closeBlock(frame, i);
        }
        return;
      case TokenType.RESERVED_KEYWORD:
      case TokenType.RESERVED_KEYWORD_PHRASE:
        break;
      default:
        return;
    }

    if (/^BEGIN\b/u.test(token.text)) {
      inHandlerDeclaration = false;
      openBlock('begin', i);
    } else if (token.text === 'HANDLER' && isKeyword(next, 'FOR')) {
      inHandlerDeclaration = true;
    } else if (isStatementStart && ['IF', 'WHILE', 'FOR'].includes(token.text)) {
      inHandlerDeclaration = false;
      openHeader(token.text.toLowerCase() as FrameKind);
    } else if (isStatementStart && token.text === 'LOOP') {
      inHandlerDeclaration = false;
      openBlock('loop', i);
    } else if (token.text === 'ELSEIF' && frame?.kind === 'if' && !frame.inHeader) {
      // Closes the THEN-block, the next THEN opens a new one
      frame.edits.push([i, TokenType.BLOCK_END]);
      frame.inHeader = true;
    } else if (token.text === 'DO' && topIs('while', 'for') && frame?.inHeader) {
      frame.inHeader = false;
      frame.edits.push([i, TokenType.BLOCK_START]);
      blockStarts.add(i);
    }
  });

  if (types.size === 0) {
    return tokens;
  }
  return tokens.map((token, i) => {
    const type = types.get(i);
    return type ? withType(token, type) : token;
  });
}

// END of BEGIN-block is followed by nothing special,
// but END of IF must be followed by IF, END of WHILE by WHILE, etc.
function isMatchingEnd(kind: FrameKind, next: Token | undefined): boolean {
  const endWord = isKeyword(next, 'IF', 'WHILE', 'FOR', 'LOOP') ? next?.text : undefined;
  if (kind === 'begin') {
    return endWord === undefined;
  }
  return endWord === kind.toUpperCase();
}
