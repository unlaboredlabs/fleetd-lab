import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { isReserved, Token, TokenType } from '../../lexer/token.js';
import { functions } from './hana.functions.js';
import { dataTypes, keywords } from './hana.keywords.js';

const reservedSelect = expandPhrases(['SELECT [ALL | DISTINCT]']);

const reservedClauses = expandPhrases([
  // queries
  'WITH',
  'INTO',
  'FROM',
  'WHERE',
  'GROUP BY',
  'HAVING',
  'PARTITION BY',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'FOR UPDATE [OF]',
  'FOR SHARE LOCK',
  'FOR {JSON | XML}',
  // Data manipulation
  // - insert:
  'INSERT INTO',
  'VALUES',
  // - update:
  'SET',
  // - upsert:
  'UPSERT',
  // - merge:
  'MERGE INTO',
  'WHEN [NOT] MATCHED [THEN]',
  'UPDATE SET',
  'INSERT',
]);

const standardOnelineClauses = expandPhrases([
  'CREATE [COLUMN | ROW | HISTORY COLUMN | {GLOBAL | LOCAL} TEMPORARY [COLUMN | ROW] | VIRTUAL] TABLE',
]);

const tabularOnelineClauses = expandPhrases([
  // - create:
  'CREATE [OR REPLACE] VIEW',
  // - update:
  'UPDATE',
  // - delete:
  'DELETE [HISTORY] FROM',
  // - upsert:
  'WITH PRIMARY KEY',
  // - query hints:
  'WITH HINT',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER TABLE',
  'ADD',
  'DROP',
  'ALTER',
  'RENAME TABLE',
  'RENAME COLUMN',
  'RENAME TO',
  // - truncate:
  'TRUNCATE TABLE',
  // SAP HANA SQL Reference Guide: SQL Statements
  'ALTER {AUDIT POLICY | CREDENTIAL | FULLTEXT INDEX | FUNCTION | INDEX | LIBRARY | PROCEDURE | REMOTE SOURCE | ROLE | SCHEMA | SEQUENCE | STATISTICS | SYSTEM | USER | USERGROUP | VIEW | VIRTUAL TABLE}',
  'BACKUP DATA',
  'CALL',
  'COMMENT ON',
  'COMMIT [WORK]',
  'CONNECT',
  'CREATE [OR REPLACE] {FUNCTION | PROCEDURE | TRIGGER | SYNONYM | PUBLIC SYNONYM}',
  'CREATE [UNIQUE] [BTREE | CPBTREE | INVERTED {HASH | VALUE | INDIVIDUAL}] INDEX',
  'CREATE {AUDIT POLICY | CREDENTIAL | FULLTEXT INDEX | GRAPH WORKSPACE | LIBRARY | REMOTE SOURCE | RESTRICTED USER | ROLE | SCHEMA | SEQUENCE | STATISTICS | STRUCTURED PRIVILEGE | TYPE | USER | USERGROUP | VIRTUAL FUNCTION | VIRTUAL PROCEDURE}',
  'DECLARE',
  'DROP {AUDIT POLICY | CREDENTIAL | FULLTEXT INDEX | FUNCTION | GRAPH WORKSPACE | INDEX | LIBRARY | PROCEDURE | REMOTE SOURCE | ROLE | SCHEMA | SEQUENCE | STATISTICS | STRUCTURED PRIVILEGE | SYNONYM | PUBLIC SYNONYM | TRIGGER | TYPE | USER | USERGROUP | VIEW}',
  'EXEC',
  'EXECUTE IMMEDIATE',
  'EXPLAIN PLAN',
  'EXPORT',
  'GRANT',
  'IMPORT',
  'LOAD',
  'LOCK TABLE',
  'MERGE DELTA OF',
  'RELEASE SAVEPOINT',
  'RETURN',
  'REVOKE',
  'ROLLBACK [WORK] [TO SAVEPOINT]',
  'SAVEPOINT',
  'SET SCHEMA',
  'SET TRANSACTION',
  'SIGNAL',
  'RESIGNAL',
  'UNLOAD',
  'UNSET',
]);

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'EXCEPT [DISTINCT]',
  'INTERSECT [DISTINCT]',
  'MINUS',
]);

// No NATURAL joins in SAP HANA.
// But a join can specify its cardinality, like: LEFT OUTER MANY TO ONE JOIN
const joinCardinality = '[{MANY | ONE | EXACT ONE} TO {MANY | ONE | EXACT ONE}]';
const reservedJoins = expandPhrases([
  `[INNER] ${joinCardinality} JOIN`,
  `{LEFT | RIGHT | FULL} [OUTER] ${joinCardinality} JOIN`,
  'CROSS JOIN',
]);

const blockBeginPhrases = expandPhrases([
  'BEGIN {AUTONOMOUS TRANSACTION | PARALLEL EXECUTION | SEQUENTIAL EXECUTION}',
]);

const reservedKeywordPhrases = expandPhrases([
  ...blockBeginPhrases,
  'ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]',
  '{ROWS | RANGE} BETWEEN',
  // These are not the WITH clause of common table expressions
  '{START | RESTART} WITH',
  'WITH {GRANT | ADMIN | CHECK} OPTION',
  'WITH [NO] DATA',
  'WITH [NO] DEPENDENCIES',
  'WITH ANNOTATIONS',
  'WITH CACHE',
  'WITH ENCRYPTION',
  'WITH ORDINALITY',
  'WITH OVERVIEW',
  'WITH PARAMETERS',
  'WITH READ ONLY',
  'WITH RECONFIGURE',
  'WITH RESULT VIEW',
  'WITH STRUCTURED PRIVILEGE CHECK',
]);

const reservedDataTypePhrases = expandPhrases([]);

// SAP HANA SQL (SAP HANA SQL Reference Guide) and SQLScript (SAP HANA SQLScript Reference)
export const hana: DialectOptions = {
  name: 'hana',
  tokenizerOptions: {
    reservedSelect,
    reservedClauses: [...reservedClauses, ...standardOnelineClauses, ...tabularOnelineClauses],
    reservedSetOperations,
    reservedJoins,
    reservedKeywordPhrases,
    reservedDataTypePhrases,
    reservedKeywords: keywords,
    reservedDataTypes: dataTypes,
    reservedFunctionNames: functions,
    extraParens: ['[]'],
    stringTypes: [
      { quote: "''-qq", prefixes: ['N'] },
      { quote: "''-raw", prefixes: ['X'], requirePrefix: true },
    ],
    identTypes: [`""-qq`],
    // Local temporary tables are named like #tmp
    identChars: { first: '#', rest: '#$' },
    // SQLScript system variables like ::SQL_ERROR_CODE
    variableTypes: [{ regex: String.raw`::[A-Za-z_][A-Za-z0-9_#$]*` }],
    paramTypes: { positional: true, named: [':'] },
    operators: ['||', '=>', ':=', '..'],
    postProcess,
  },
  formatOptions: {
    alwaysDenseOperators: ['..'],
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
  },
};

function postProcess(tokens: Token[]): Token[] {
  return detectBlocks(splitWithPhrasesStartingCte(splitRanges(tokens)));
}

const isComment = (t: Token) =>
  t.type === TokenType.LINE_COMMENT ||
  t.type === TokenType.BLOCK_COMMENT ||
  t.type === TokenType.DISABLE_COMMENT;

const isKeyword = (t: Token | undefined, ...words: string[]): boolean =>
  t !== undefined && isReserved(t.type) && words.includes(t.text);

const isOperator = (t: Token | undefined, ...ops: string[]): boolean =>
  t !== undefined && t.type === TokenType.OPERATOR && ops.includes(t.text);

const isParen = (t: Token | undefined, ...parens: string[]): boolean =>
  t !== undefined &&
  (t.type === TokenType.OPEN_PAREN || t.type === TokenType.CLOSE_PAREN) &&
  parens.includes(t.text);

const isPropertyAccess = (t: Token | undefined): boolean =>
  t !== undefined && t.type === TokenType.PROPERTY_ACCESS_OPERATOR;

/** Non-comment tokens before and after each token */
const neighbours = (tokens: Token[]) => {
  const prev: (Token | undefined)[] = [];
  const next: (Token | undefined)[] = [];
  let last: Token | undefined;
  tokens.forEach((t, i) => {
    prev[i] = last;
    if (!isComment(t)) {
      last = t;
    }
  });
  last = undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    next[i] = last;
    if (!isComment(tokens[i])) {
      last = tokens[i];
    }
  }
  return { prev, next };
};

/**
 * The tokenizer reads the range 1..10 of a FOR loop as numbers "1." and ".10"
 * (or "1." and "." when followed by a variable, like 1..:n).
 * Splits these into 1 .. 10 (and 1 .. :n)
 */
function splitRanges(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      /^\d+\.$/.test(token.raw) &&
      nextToken &&
      !nextToken.precedingWhitespace &&
      ((nextToken.type === TokenType.NUMBER && /^\.\d+$/.test(nextToken.raw)) ||
        (nextToken.type === TokenType.PROPERTY_ACCESS_OPERATOR && nextToken.raw === '.'))
    ) {
      const num = token.raw.slice(0, -1);
      result.push({ ...token, raw: num, text: num });
      result.push({
        type: TokenType.OPERATOR,
        raw: '..',
        text: '..',
        start: token.start + num.length,
      });
      if (nextToken.type === TokenType.NUMBER) {
        const num2 = nextToken.raw.slice(1);
        result.push({ ...nextToken, raw: num2, text: num2, start: nextToken.start + 1 });
      }
      i++;
    } else {
      result.push(token);
    }
  }
  return result;
}

/**
 * Phrases like WITH DATA or WITH HINT are not common table expressions.
 * But in a place where a query can start, WITH starts a CTE
 * and the word following it is the name of the CTE, like in:
 *
 *     WITH data AS (SELECT ...) SELECT * FROM data
 */
function splitWithPhrasesStartingCte(tokens: Token[]): Token[] {
  const { prev } = neighbours(tokens);
  return tokens.flatMap((token, i) => {
    const match = /^(WITH)(\s+)(\S+)$/iu.exec(token.raw);
    if (
      match &&
      (token.type === TokenType.RESERVED_KEYWORD_PHRASE ||
        token.type === TokenType.RESERVED_CLAUSE) &&
      canStartQuery(prev[i])
    ) {
      const [, withRaw, whitespace, nameRaw] = match;
      return [
        { ...token, type: TokenType.RESERVED_CLAUSE, raw: withRaw, text: 'WITH' },
        {
          type: TokenType.IDENTIFIER,
          raw: nameRaw,
          text: nameRaw,
          start: token.start + withRaw.length + whitespace.length,
          precedingWhitespace: whitespace,
        },
      ];
    }
    return [token];
  });
}

const canStartQuery = (prevToken: Token | undefined): boolean =>
  prevToken === undefined ||
  prevToken.type === TokenType.DELIMITER ||
  prevToken.type === TokenType.BLOCK_START ||
  isParen(prevToken, '(') ||
  isKeyword(
    prevToken,
    'AS',
    'BEGIN',
    'THEN',
    'ELSE',
    'DO',
    'LOOP',
    'REPEAT',
    ...blockBeginPhrases
  ) ||
  isOperator(prevToken, '=', ':=');

const keywordOnlyStatements = ['GRANT', 'REVOKE', 'IMPORT', 'EXPORT', 'SIGNAL', 'RESIGNAL'];

type BlockType = 'CASE' | 'IF' | 'BLOCK' | 'REPEAT';

/**
 * Detects the structure of SQLScript blocks:
 *
 *     BEGIN ... END
 *     IF ... THEN ... ELSEIF ... THEN ... ELSE ... END IF
 *     WHILE ... DO ... END WHILE
 *     FOR ... DO ... END FOR
 *     LOOP ... END LOOP
 *     REPEAT ... UNTIL ... END REPEAT
 *
 * and marks the keywords that start and end the blocks
 * (as opposed to e.g. the ELSE and END of a CASE expression).
 *
 * Also takes care of other keywords whose meaning depends on their position.
 */
function detectBlocks(tokens: Token[]): Token[] {
  const { prev, next } = neighbours(tokens);
  const stack: BlockType[] = [];
  const top = () => stack[stack.length - 1];
  let parenDepth = 0;
  let statementStart = true;
  let statementFirstWord: string | undefined;
  // The keyword that will start the block of current IF, WHILE or FOR
  let pendingBlockStart: 'THEN' | 'DO' | undefined;
  // The END of REPEAT ... UNTIL ... END REPEAT ends no block (UNTIL did that already)
  let pendingRepeatEnd = false;
  // Inside procedure, function or trigger definition, until its BEGIN
  let routineHeader = false;

  return tokens.map((token, i) => {
    if (isComment(token)) {
      return token;
    }
    const prevToken = prev[i];
    const nextToken = next[i];
    const atStatementStart = statementStart;
    statementStart = false;
    if (atStatementStart) {
      statementFirstWord = isReserved(token.type) ? token.text : undefined;
    }

    if (isPropertyAccess(prevToken) || isPropertyAccess(nextToken)) {
      // A keyword used as a name, like seq.NEXTVAL
      return token;
    }
    if (isParen(token, '(', '[')) {
      parenDepth++;
      return token;
    }
    if (isParen(token, ')', ']')) {
      parenDepth = Math.max(0, parenDepth - 1);
      return token;
    }
    if (token.type === TokenType.DELIMITER) {
      while (top() === 'CASE') {
        stack.pop();
      }
      parenDepth = 0;
      statementStart = true;
      pendingBlockStart = undefined;
      pendingRepeatEnd = false;
      routineHeader = false;
      return token;
    }
    if (token.type === TokenType.CASE) {
      stack.push('CASE');
      return token;
    }
    // Reserved words can be used as aliases after AS
    const isAlias = isKeyword(prevToken, 'AS') && token.type !== TokenType.RESERVED_KEYWORD_PHRASE;

    if (token.type === TokenType.END) {
      if (top() === 'CASE') {
        stack.pop();
        return token;
      }
      if (isAlias) {
        return token;
      }
      if (pendingRepeatEnd) {
        pendingRepeatEnd = false;
        return token;
      }
      stack.pop();
      return { ...token, type: TokenType.BLOCK_END };
    }
    if (token.type === TokenType.THEN) {
      if (top() !== 'CASE' && pendingBlockStart === 'THEN' && parenDepth === 0 && !isAlias) {
        pendingBlockStart = undefined;
        statementStart = true;
        return { ...token, type: TokenType.BLOCK_START };
      }
      return token;
    }
    if (token.type === TokenType.ELSE) {
      if (top() === 'IF' && parenDepth === 0 && !isAlias) {
        statementStart = true;
        return { ...token, type: TokenType.BLOCK_MIDDLE };
      }
      return token;
    }
    // VALUES in partition definitions, like: PARTITION 10 <= VALUES < 20
    if (
      token.type === TokenType.RESERVED_CLAUSE &&
      token.text === 'VALUES' &&
      (isOperator(prevToken, '<', '<=', '=') || isOperator(nextToken, '<', '<=', '='))
    ) {
      return { ...token, type: TokenType.RESERVED_KEYWORD };
    }
    // SQLScript variable used as array, like :arr[1]
    if (token.type === TokenType.NAMED_PARAMETER && isParen(tokens[i + 1], '[')) {
      return { ...token, type: TokenType.IDENTIFIER };
    }
    if (!isReserved(token.type) || parenDepth > 0) {
      return token;
    }

    switch (token.text) {
      case 'IF':
        if (atStatementStart) {
          stack.push('IF');
          pendingBlockStart = 'THEN';
        }
        return token;
      case 'ELSEIF':
        if (top() === 'IF') {
          pendingBlockStart = 'THEN';
          return { ...token, type: TokenType.BLOCK_END };
        }
        return token;
      case 'WHILE':
      case 'FOR':
        if (atStatementStart) {
          stack.push('BLOCK');
          pendingBlockStart = 'DO';
        }
        return token;
      case 'DO':
        if (pendingBlockStart === 'DO') {
          pendingBlockStart = undefined;
          statementStart = true;
          return { ...token, type: TokenType.BLOCK_START };
        }
        return token;
      case 'LOOP':
        if (atStatementStart) {
          stack.push('BLOCK');
          statementStart = true;
          return { ...token, type: TokenType.BLOCK_START };
        }
        return token;
      case 'REPEAT':
        if (atStatementStart && !isParen(nextToken, '(')) {
          stack.push('REPEAT');
          statementStart = true;
          return { ...token, type: TokenType.BLOCK_START };
        }
        return token;
      case 'UNTIL':
        if (top() === 'REPEAT') {
          stack.pop();
          pendingRepeatEnd = true;
          return { ...token, type: TokenType.BLOCK_END };
        }
        return token;
      case 'BEGIN':
      case 'BEGIN AUTONOMOUS TRANSACTION':
      case 'BEGIN PARALLEL EXECUTION':
      case 'BEGIN SEQUENTIAL EXECUTION':
        // AS BEGIN is the body of a procedure or function, otherwise an alias
        if (isAlias && !routineHeader) {
          return token;
        }
        stack.push('BLOCK');
        statementStart = true;
        routineHeader = false;
        return { ...token, type: TokenType.BLOCK_START };
      // REPLACE statement is the same as UPSERT, not the REPLACE() function
      case 'REPLACE':
        if (atStatementStart && !isParen(nextToken, '(')) {
          return { ...token, type: TokenType.RESERVED_CLAUSE };
        }
        return token;
    }

    if (/^(CREATE|ALTER)( OR REPLACE)? (PROCEDURE|FUNCTION|TRIGGER)$/u.test(token.text)) {
      routineHeader = true;
    }

    // Words which aren't clauses in these statements, like:
    //   GRANT SELECT, INSERT ON tbl TO usr
    //   IMPORT FROM CSV FILE 'file.csv' INTO tbl WITH THREADS 4
    //   SIGNAL my_condition SET MESSAGE_TEXT = 'Failed'
    //   CREATE TRIGGER trg AFTER INSERT OR UPDATE ON tbl ...
    if (
      !atStatementStart &&
      (keywordOnlyStatements.includes(statementFirstWord ?? '') || routineHeader) &&
      (token.type === TokenType.RESERVED_CLAUSE ||
        token.type === TokenType.RESERVED_SELECT ||
        token.type === TokenType.OR)
    ) {
      return { ...token, type: TokenType.RESERVED_KEYWORD };
    }
    return token;
  });
}
