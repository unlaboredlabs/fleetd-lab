import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { Token, TokenType } from '../../lexer/token.js';
import { functions } from './hana.functions.js';
import { dataTypes, keywords, nameLikeKeywords } from './hana.keywords.js';

// https://help.sap.com/docs/SAP_HANA_PLATFORM/4fe29514fd584807ac9f2a04f6754767/b4b0eec1968f41a099c828a4a6c8ca0f.html

const reservedSelect = expandPhrases(['SELECT [ALL | DISTINCT]']);

const reservedClauses = expandPhrases([
  // queries
  'WITH',
  'FROM',
  'WHERE',
  'GROUP BY',
  'HAVING',
  'PARTITION BY',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'FETCH {FIRST | NEXT}',
  'FOR UPDATE [OF]',
  'FOR SHARE LOCK',
  'INTO',
  // Data manipulation
  // - insert:
  'INSERT INTO',
  'VALUES',
  // - upsert/replace:
  'UPSERT',
  'REPLACE',
  // - update:
  'SET',
  // - merge:
  'MERGE INTO',
  'WHEN [NOT] MATCHED [THEN]',
  'UPDATE SET',
  'INSERT',
  // privileges
  'GRANT',
  'REVOKE',
]);

const standardOnelineClauses = expandPhrases([
  'CREATE [COLUMN | ROW | HISTORY COLUMN | VIRTUAL | {LOCAL | GLOBAL} TEMPORARY [COLUMN | ROW]] TABLE',
]);

const tabularOnelineClauses = expandPhrases([
  // - create:
  'CREATE [OR REPLACE] [RECURSIVE] VIEW',
  'CREATE PROJECTION VIEW',
  // - update:
  'UPDATE',
  // - delete:
  'DELETE [HISTORY] FROM',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER [VIRTUAL] TABLE',
  'ADD',
  'DROP',
  'ALTER',
  // - truncate:
  'TRUNCATE TABLE',
  // - query hints and upsert:
  'WITH HINT',
  'WITH PRIMARY KEY',
  // SQLScript procedures and functions
  'CREATE [OR REPLACE] {PROCEDURE | FUNCTION}',
  'CREATE VIRTUAL {PROCEDURE | FUNCTION}',
  'ALTER {PROCEDURE | FUNCTION}',
  'DROP {PROCEDURE | FUNCTION}',
  'LANGUAGE',
  'SQL SECURITY',
  'DEFAULT SCHEMA',
  'READS SQL DATA',
  'RETURNS',
  'DO',
  'BEGIN [AUTONOMOUS TRANSACTION | SEQUENTIAL EXECUTION | PARALLEL EXECUTION]',
  'DECLARE',
  'IF',
  'ELSEIF',
  'WHILE',
  'FOR',
  'LOOP',
  'BREAK',
  'CONTINUE',
  'RETURN',
  'SIGNAL',
  'RESIGNAL',
  'EXEC',
  'EXECUTE IMMEDIATE',
  'OPEN',
  'FETCH',
  'CLOSE',
  'CALL',
  // other statements
  'ALTER AUDIT POLICY',
  'ALTER CREDENTIAL',
  'ALTER DATABASE',
  'ALTER FULLTEXT INDEX',
  'ALTER INDEX',
  'ALTER LIBRARY',
  'ALTER PSE',
  'ALTER REMOTE SOURCE',
  'ALTER ROLE',
  'ALTER SCHEDULER JOB',
  'ALTER SEQUENCE',
  'ALTER STATISTICS',
  'ALTER STRUCTURED PRIVILEGE',
  'ALTER SYSTEM',
  'ALTER USER',
  'ALTER USERGROUP',
  'ALTER VIEW',
  'ALTER WORKLOAD {CLASS | MAPPING}',
  'ANNOTATE',
  'BACKUP',
  'CANCEL ASYNC CALL',
  'COMMENT ON',
  'COMMIT',
  'CONNECT',
  'CREATE AUDIT POLICY',
  'CREATE CERTIFICATE',
  'CREATE CREDENTIAL',
  'CREATE DATABASE',
  'CREATE FULLTEXT INDEX',
  'CREATE FUZZY SEARCH INDEX',
  'CREATE GRAPH WORKSPACE',
  'CREATE [UNIQUE] [BTREE | CPBTREE | INVERTED {HASH | VALUE | INDIVIDUAL}] INDEX',
  'CREATE [OR REPLACE] LIBRARY',
  'CREATE PSE',
  'CREATE PUBLIC KEY',
  'CREATE REMOTE SOURCE',
  'CREATE ROLE',
  'CREATE SCHEDULER JOB',
  'CREATE SCHEMA',
  'CREATE SCHEMA SYNONYM',
  'CREATE SEQUENCE',
  'CREATE STATISTICS',
  'CREATE STRUCTURED PRIVILEGE',
  'CREATE [PUBLIC] SYNONYM',
  'CREATE [OR REPLACE] TRIGGER',
  'CREATE TYPE',
  'CREATE USER',
  'CREATE USERGROUP',
  'CREATE WORKLOAD {CLASS | MAPPING}',
  'DROP AUDIT POLICY',
  'DROP CERTIFICATE',
  'DROP CREDENTIAL',
  'DROP DATABASE',
  'DROP FULLTEXT INDEX',
  'DROP GRAPH WORKSPACE',
  'DROP INDEX',
  'DROP LIBRARY',
  'DROP PSE',
  'DROP PUBLIC KEY',
  'DROP REMOTE SOURCE',
  'DROP ROLE',
  'DROP SCHEDULER JOB',
  'DROP SCHEMA [SYNONYM]',
  'DROP SEQUENCE',
  'DROP STATISTICS',
  'DROP STRUCTURED PRIVILEGE',
  'DROP [PUBLIC] SYNONYM',
  'DROP TRIGGER',
  'DROP TYPE',
  'DROP USER',
  'DROP USERGROUP',
  'DROP VIEW',
  'DROP WORKLOAD {CLASS | MAPPING}',
  'EXPLAIN PLAN',
  'EXPORT [INTO]',
  'IMPORT [FROM | SCAN]',
  'LOAD',
  'LOCK TABLE',
  'MERGE DELTA OF',
  'RECOVER {DATA | DATABASE}',
  'REFRESH {STATISTICS | VIEW}',
  'RELEASE SAVEPOINT',
  'RENAME {COLUMN | DATABASE | INDEX | SCHEMA | TABLE}',
  'ROLLBACK [TO SAVEPOINT]',
  'SAVEPOINT',
  'SET HISTORY SESSION',
  'SET PSE',
  'SET SCHEMA',
  'SET SESSION',
  'SET SYSTEM LICENSE',
  'SET TRANSACTION',
  'UNLOAD',
  'UNSET [SESSION | PSE | SYSTEM LICENSE ALL]',
  'VALIDATE {LDAP PROVIDER | USER}',
]);

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'INTERSECT [DISTINCT]',
  'EXCEPT [DISTINCT]',
]);

const reservedJoins = expandPhrases([
  // HANA has no NATURAL joins, but supports join cardinality specifiers
  '[INNER | {LEFT | RIGHT | FULL} [OUTER]] [{MANY | [EXACT] ONE} TO {MANY | [EXACT] ONE}] JOIN',
  'CROSS JOIN',
]);

const reservedKeywordPhrases = expandPhrases([
  'ON {UPDATE | DELETE} [SET NULL | SET DEFAULT | CASCADE | RESTRICT]',
  'ON COMMIT {DELETE | PRESERVE} ROWS',
  '{ROWS | RANGE} BETWEEN',
  'START WITH',
  'WITH {GRANT | ADMIN} OPTION',
  'WITH [NO] DATA',
  'WITH PARAMETERS',
  'WITH ORDINALITY',
  'WITH CHECK OPTION',
  'WITH READ ONLY',
  'WITH RESULT VIEW',
  'WITH ENCRYPTION',
  'WITH STRUCTURED PRIVILEGE CHECK',
  'WITH CACHE',
  'FOR SYSTEM_TIME',
  'FOR APPLICATION_TIME',
  'FOR EACH {ROW | STATEMENT}',
  'EXIT HANDLER FOR',
  'CONTINUE HANDLER FOR',
]);

const reservedDataTypePhrases = expandPhrases([]);

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
    identChars: { first: '#', rest: '#$' },
    // SQLScript system variables like ::ROWCOUNT and ::SQL_ERROR_CODE
    variableTypes: [{ regex: '::[A-Za-z_][A-Za-z0-9_]*' }],
    // In SQLScript :name refers to a variable or parameter
    paramTypes: { positional: true, named: [':'], quoted: [':'] },
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
  return disambiguateKeywords(disambiguateClauses(mergeSelectTop(splitRangeOperators(tokens))));
}

// Clauses that are only recognized at the start of a (SQLScript) statement.
// Elsewhere these words are plain identifiers (e.g. column names) or keywords.
const statementStartClauses = [
  'DO',
  'DECLARE',
  'IF',
  'ELSEIF',
  'WHILE',
  'FOR',
  'LOOP',
  'BREAK',
  'CONTINUE',
  'RETURN',
  'SIGNAL',
  'RESIGNAL',
  'EXEC',
  'OPEN',
  'FETCH',
  'CLOSE',
  'CALL',
  'ANNOTATE',
  'BACKUP',
  'COMMIT',
  'CONNECT',
  'EXPORT',
  'IMPORT',
  'LOAD',
  'SAVEPOINT',
  'UNLOAD',
];

// Statement words that HANA reserves, so elsewhere they can only be keywords, not column names
const reservedStatementWords = [
  'DECLARE',
  'IF',
  'ELSEIF',
  'WHILE',
  'FOR',
  'LOOP',
  'RETURN',
  'EXEC',
  'CONNECT',
];

// Clauses that are only recognized in the header of a procedure or function
const routineHeaderClauses = [
  'LANGUAGE',
  'SQL SECURITY',
  'DEFAULT SCHEMA',
  'READS SQL DATA',
  'RETURNS',
];
const isRoutineStatement = (statement: Token): boolean =>
  /^(CREATE|ALTER)( OR REPLACE| VIRTUAL)? (PROCEDURE|FUNCTION)$/.test(statement.text);

// Clauses that are only recognized inside ALTER TABLE
const alterTableClauses = ['ADD', 'DROP', 'ALTER'];

/**
 * Converts RESERVED_CLAUSE tokens that don't start a clause at their position
 * into keywords (or function names).
 */
function disambiguateClauses(tokens: Token[]): Token[] {
  // The first clause of the current statement
  let statement: Token | undefined;
  // Parenthesis nesting depth, and the depth at which the current statement started
  let depth = 0;
  let statementDepth = 0;
  // Nesting depth of CASE expressions
  let caseDepth = 0;

  const result: Token[] = [];
  const disambiguate = (token: Token, i: number): Token | Token[] => {
    const prev = prevToken(tokens, i);
    // check the converted previous token, so that e.g. a table named do doesn't start a statement
    if (isStatementStart(prevToken(result, result.length), caseDepth > 0)) {
      statement = undefined;
    }
    if (token.type === TokenType.CASE) {
      caseDepth++;
    } else if (token.type === TokenType.END && caseDepth > 0) {
      caseDepth--;
    } else if (token.type === TokenType.DELIMITER) {
      caseDepth = 0;
    }
    if (token.type === TokenType.OPEN_PAREN) {
      depth++;
    } else if (token.type === TokenType.CLOSE_PAREN) {
      depth--;
    }
    // SQLScript array element access, e.g. :arr[1]
    if (token.type === TokenType.NAMED_PARAMETER && nextToken(tokens, i).text === '[') {
      return { ...token, type: TokenType.IDENTIFIER };
    }
    // OR between trigger events, e.g. AFTER INSERT OR UPDATE ON ...
    if (
      token.type === TokenType.OR &&
      isTriggerEvent(prev) &&
      isTriggerEvent(nextToken(tokens, i))
    ) {
      return toKeyword(token);
    }
    if (token.type !== TokenType.RESERVED_CLAUSE && token.type !== TokenType.RESERVED_SELECT) {
      return token;
    }
    if (!statement) {
      statement = token;
      statementDepth = depth;
    }

    // privilege names in GRANT and REVOKE statements, e.g. GRANT SELECT, INSERT, UPDATE ON ...
    if (statement !== token && (statement.text === 'GRANT' || statement.text === 'REVOKE')) {
      return toKeyword(token);
    }
    if (token.type === TokenType.RESERVED_SELECT) {
      return token;
    }
    // REPLACE(...) and LANGUAGE(...) are function calls, but not table names like CREATE TABLE language (...)
    const next = nextToken(tokens, i);
    if (
      next.type === TokenType.OPEN_PAREN &&
      next.text === '(' &&
      functions.includes(token.text) &&
      !isBeforeTableName(prev)
    ) {
      return { ...token, type: TokenType.RESERVED_FUNCTION_NAME };
    }
    if (
      // WITH not followed by a common table expression, e.g. WITH GRANT OPTION
      (token.text === 'WITH' && !isCommonTableExpression(tokens, i)) ||
      // END IF, END WHILE, END FOR, END LOOP
      (prev.type === TokenType.END && ['IF', 'WHILE', 'FOR', 'LOOP'].includes(token.text)) ||
      // CREATE OR REPLACE ...
      (token.text === 'REPLACE' && prev.type === TokenType.OR) ||
      // trigger events, e.g. AFTER INSERT OR UPDATE ON ...
      (['INSERT', 'UPDATE', 'DELETE'].includes(token.text) &&
        (prev.type === TokenType.OR || ['BEFORE', 'AFTER', 'OF'].includes(prev.text))) ||
      // range partitions, e.g. PARTITION 1 <= VALUES < 10
      (token.text === 'VALUES' && prev.type === TokenType.OPERATOR) ||
      (alterTableClauses.includes(token.text) && !/^ALTER (VIRTUAL )?TABLE$/.test(statement.text))
    ) {
      return toKeyword(token);
    }
    // column names followed by a clause, e.g. SELECT import FROM t
    if (/^(IMPORT|EXPORT) (FROM|INTO)$/.test(token.text) && statement !== token) {
      const [word, clause] = splitClause(token);
      return [toKeywordOrIdentifier(word, prev, clause, statement), clause];
    }
    if (
      // column names like language, open or load, and loops like WHILE ... DO and FOR ... DO
      (statementStartClauses.includes(token.text) && statement !== token) ||
      (routineHeaderClauses.includes(token.text) &&
        !(isRoutineStatement(statement) && depth === statementDepth))
    ) {
      return toKeywordOrIdentifier(token, prev, next, statement);
    }
    return token;
  };

  tokens.forEach((token, i) => {
    const converted = disambiguate(token, i);
    result.push(...(Array.isArray(converted) ? converted : [converted]));
  });
  return result;
}

const toKeyword = (token: Token): Token => ({ ...token, type: TokenType.RESERVED_KEYWORD });

// Converts a clause token that doesn't start a clause into an identifier where it is
// a column name (or other expression), and into a keyword where it is part of the syntax
const toKeywordOrIdentifier = (
  token: Token,
  prev: Token,
  next: Token,
  statement: Token | undefined
): Token => {
  if (reservedClauses.includes(token.text)) {
    return token;
  }
  if (
    reservedStatementWords.includes(token.text) ||
    // multi-word clauses, e.g. SQL SECURITY
    token.text.includes(' ') ||
    // loops like WHILE ... DO and FOR ... DO
    (token.text === 'DO' && /^(WHILE|FOR)$/.test(statement?.text ?? '')) ||
    // e.g. ALTER SYSTEM SAVEPOINT
    (prev.type === TokenType.RESERVED_CLAUSE && prev.text === 'ALTER SYSTEM')
  ) {
    return toKeyword(token);
  }
  if (
    isBeforeExpression(prev) ||
    isAfterExpression(next) ||
    isBeforeTableName(prev) ||
    (prev.type === TokenType.RESERVED_KEYWORD && prev.text === 'AS')
  ) {
    return toIdentifier(token);
  }
  // e.g. UNLOAD PRIORITY 5, AS OF COMMIT ID 5
  return toKeyword(token);
};

const toIdentifier = (token: Token): Token => ({
  ...token,
  type: TokenType.IDENTIFIER,
  text: token.raw,
});

/**
 * Converts non-reserved keywords that are used as names (e.g. SELECT id, page FROM unit)
 * into identifiers. Runs after disambiguateClauses(), so clauses that were converted
 * into keywords (e.g. LOAD in LOAD UNIT PAGE) count as keywords here.
 */
function disambiguateKeywords(tokens: Token[]): Token[] {
  return tokens.map((token, i) => {
    if (token.type !== TokenType.RESERVED_KEYWORD || !nameLikeKeywords.includes(token.text)) {
      return token;
    }
    const prev = prevToken(tokens, i);
    if (
      isBeforeExpression(prev) ||
      isBeforeTableName(prev) ||
      (prev.type === TokenType.RESERVED_KEYWORD &&
        ['AS', 'ON', 'TO', 'DISTINCT', 'NOT', 'LIKE'].includes(prev.text)) ||
      // e.g. WHERE id = 1, but not LOAD UNIT PAGE; or WITH OVERVIEW;
      (isAfterExpression(nextToken(tokens, i)) &&
        prev.type !== TokenType.RESERVED_KEYWORD &&
        prev.type !== TokenType.RESERVED_KEYWORD_PHRASE)
    ) {
      return toIdentifier(token);
    }
    return token;
  });
}

// True when the token can be followed by a table name
const isBeforeTableName = (prev: Token): boolean =>
  prev.type === TokenType.RESERVED_JOIN ||
  (prev.type === TokenType.RESERVED_KEYWORD && prev.text === 'USING') ||
  (prev.type === TokenType.RESERVED_CLAUSE &&
    /^(FROM|DELETE (HISTORY )?FROM|(INSERT |MERGE )?INTO|UPDATE|UPSERT|REPLACE|.* TABLE)$/.test(
      prev.text
    ));

// True when the token can be followed by a column name or other expression
const isBeforeExpression = (prev: Token): boolean =>
  [
    TokenType.RESERVED_SELECT,
    TokenType.COMMA,
    TokenType.OPEN_PAREN,
    TokenType.PROPERTY_ACCESS_OPERATOR,
    TokenType.OPERATOR,
    TokenType.ASTERISK,
    TokenType.CASE,
    TokenType.WHEN,
    TokenType.THEN,
    TokenType.ELSE,
    TokenType.AND,
    TokenType.OR,
    TokenType.XOR,
    TokenType.BETWEEN,
  ].includes(prev.type);

// True when the token can follow a column name or other expression
const isAfterExpression = (next: Token): boolean =>
  [
    TokenType.COMMA,
    TokenType.CLOSE_PAREN,
    TokenType.DELIMITER,
    TokenType.EOF,
    TokenType.PROPERTY_ACCESS_OPERATOR,
    TokenType.OPERATOR,
    TokenType.ASTERISK,
    TokenType.RESERVED_CLAUSE,
    TokenType.RESERVED_SELECT,
    TokenType.RESERVED_SET_OPERATION,
    TokenType.RESERVED_JOIN,
    TokenType.RESERVED_DATA_TYPE,
    TokenType.END,
    TokenType.WHEN,
    TokenType.THEN,
    TokenType.ELSE,
    TokenType.AND,
    TokenType.OR,
    TokenType.XOR,
    TokenType.BETWEEN,
    TokenType.LIMIT,
  ].includes(next.type) ||
  (next.type === TokenType.RESERVED_KEYWORD &&
    ['AS', 'IS', 'IN', 'NOT', 'LIKE', 'ASC', 'DESC', 'NULLS', 'ON', 'USING'].includes(next.text));

// Splits a two-word clause token like IMPORT FROM into two clause tokens
function splitClause(token: Token): Token[] {
  const [, first, space, second] = token.raw.match(/^(\S+)(\s+)(\S+)$/) ?? [];
  const [firstText, secondText] = token.text.split(' ');
  return [
    { ...token, raw: first, text: firstText },
    { ...token, raw: second, text: secondText, start: token.start + first.length + space.length },
  ];
}

const isTriggerEvent = (token: Token): boolean =>
  (token.type === TokenType.RESERVED_CLAUSE || token.type === TokenType.RESERVED_KEYWORD) &&
  ['INSERT', 'UPDATE', 'DELETE'].includes(token.text);

// True when the token preceding a statement is the end of previous statement or block opener.
// THEN and ELSE only open a block in SQLScript IF statements, not inside CASE expressions.
const isStatementStart = (prev: Token, inCase: boolean): boolean =>
  prev.type === TokenType.EOF ||
  prev.type === TokenType.DELIMITER ||
  (!inCase && (prev.type === TokenType.THEN || prev.type === TokenType.ELSE)) ||
  // BEGIN, and DO or LOOP whether they are clauses or keywords (e.g. WHILE ... DO), but not identifiers
  ((prev.type === TokenType.RESERVED_CLAUSE || prev.type === TokenType.RESERVED_KEYWORD) &&
    /^(BEGIN|DO|LOOP)\b/.test(prev.text)) ||
  // the condition of DECLARE ... HANDLER FOR <condition> <statement>
  (prev.type === TokenType.RESERVED_KEYWORD_PHRASE && / HANDLER FOR$/.test(prev.text));

// True when WITH at index i is followed by: [RECURSIVE] name [(columns)] AS
function isCommonTableExpression(tokens: Token[], i: number): boolean {
  let j = nextIndex(tokens, i);
  if (tokens[j]?.text === 'RECURSIVE') {
    return true;
  }
  if (!isNameToken(tokens[j])) {
    return false;
  }
  j = nextIndex(tokens, j);
  if (tokens[j]?.type === TokenType.OPEN_PAREN) {
    j = nextIndex(tokens, closingParenIndex(tokens, j));
  }
  return tokens[j]?.type === TokenType.RESERVED_KEYWORD && tokens[j].text === 'AS';
}

const isNameToken = (token: Token | undefined): boolean =>
  token !== undefined &&
  (token.type === TokenType.IDENTIFIER ||
    token.type === TokenType.QUOTED_IDENTIFIER ||
    token.type === TokenType.RESERVED_KEYWORD ||
    token.type === TokenType.RESERVED_DATA_TYPE ||
    token.type === TokenType.RESERVED_FUNCTION_NAME);

/**
 * Merges SELECT TOP <number> [ALL | DISTINCT] into a single RESERVED_SELECT token,
 * so that the number doesn't end up as the first item of the select list.
 */
function mergeSelectTop(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const top = tokens[i + 1];
    const count = tokens[i + 2];
    if (
      token.type === TokenType.RESERVED_SELECT &&
      top?.type === TokenType.RESERVED_KEYWORD &&
      top.text === 'TOP' &&
      count?.type === TokenType.NUMBER &&
      /^[0-9]+$/.test(count.text)
    ) {
      const parts = [token, top, count];
      const modifier = tokens[i + 3];
      if (
        modifier?.type === TokenType.RESERVED_KEYWORD &&
        (modifier.text === 'ALL' || modifier.text === 'DISTINCT')
      ) {
        parts.push(modifier);
      }
      result.push({
        ...token,
        raw: parts.map(t => t.raw).join(' '),
        text: parts.map(t => t.text).join(' '),
      });
      i += parts.length - 1;
    } else {
      result.push(token);
    }
  }
  return result;
}

/**
 * The tokenizer reads "1..10" as numbers "1." and ".10".
 * Split these up into "1", "..", "10" (as used in SQLScript FOR loops).
 */
function splitRangeOperators(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      /^[0-9]+\.$/.test(token.text) &&
      next &&
      next.start === token.start + token.raw.length &&
      next.raw.startsWith('.') &&
      (next.type === TokenType.NUMBER || next.type === TokenType.PROPERTY_ACCESS_OPERATOR)
    ) {
      const num = token.raw.slice(0, -1);
      result.push({ ...token, raw: num, text: num });
      result.push({
        type: TokenType.OPERATOR,
        raw: '..',
        text: '..',
        start: next.start - 1,
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

const isComment = (t: Token): boolean =>
  t.type === TokenType.BLOCK_COMMENT || t.type === TokenType.LINE_COMMENT;

function nextIndex(tokens: Token[], i: number, dir: 1 | -1 = 1): number {
  let j = i + dir;
  while (tokens[j] && isComment(tokens[j])) {
    j += dir;
  }
  return j;
}

const EMPTY: Token = { type: TokenType.EOF, raw: '', text: '', start: Infinity };

const prevToken = (tokens: Token[], i: number): Token => tokens[nextIndex(tokens, i, -1)] ?? EMPTY;

const nextToken = (tokens: Token[], i: number): Token => tokens[nextIndex(tokens, i)] ?? EMPTY;

function closingParenIndex(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let j = openIndex; j < tokens.length; j++) {
    if (tokens[j].type === TokenType.OPEN_PAREN) {
      depth++;
    } else if (tokens[j].type === TokenType.CLOSE_PAREN) {
      depth--;
      if (depth === 0) {
        return j;
      }
    }
  }
  return tokens.length;
}
