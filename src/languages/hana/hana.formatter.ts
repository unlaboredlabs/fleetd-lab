import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { Token, TokenType } from '../../lexer/token.js';
import { functions } from './hana.functions.js';
import { dataTypes, keywords } from './hana.keywords.js';

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
  return disambiguateClauses(mergeSelectTop(splitRangeOperators(tokens)));
}

// Clauses that are only recognized at the start of a (SQLScript) statement
const statementStartClauses = ['DO', 'FOR', 'LOOP'];

// Clauses that are only recognized inside ALTER TABLE
const alterTableClauses = ['ADD', 'DROP', 'ALTER'];

/**
 * Converts RESERVED_CLAUSE tokens that don't start a clause at their position
 * into keywords (or function names).
 */
function disambiguateClauses(tokens: Token[]): Token[] {
  // The first clause of the current statement
  let statement: Token | undefined;

  return tokens.map((token, i) => {
    const prev = prevToken(tokens, i);
    if (isStatementStart(prev)) {
      statement = undefined;
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
    statement = statement ?? token;

    // privilege names in GRANT and REVOKE statements, e.g. GRANT SELECT, INSERT, UPDATE ON ...
    if (statement !== token && (statement.text === 'GRANT' || statement.text === 'REVOKE')) {
      return toKeyword(token);
    }
    if (token.type === TokenType.RESERVED_SELECT) {
      return token;
    }
    // REPLACE(...) and LANGUAGE(...) are function calls
    const next = nextToken(tokens, i);
    if (next.type === TokenType.OPEN_PAREN && next.text === '(' && functions.includes(token.text)) {
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
      // loops like WHILE ... DO and FOR ... DO
      (statementStartClauses.includes(token.text) && statement !== token) ||
      (alterTableClauses.includes(token.text) && !/^ALTER (VIRTUAL )?TABLE$/.test(statement.text))
    ) {
      return toKeyword(token);
    }
    return token;
  });
}

const toKeyword = (token: Token): Token => ({ ...token, type: TokenType.RESERVED_KEYWORD });

const isTriggerEvent = (token: Token): boolean =>
  (token.type === TokenType.RESERVED_CLAUSE || token.type === TokenType.RESERVED_KEYWORD) &&
  ['INSERT', 'UPDATE', 'DELETE'].includes(token.text);

// True when the token preceding a statement is the end of previous statement or block opener
const isStatementStart = (prev: Token): boolean =>
  prev.type === TokenType.EOF ||
  prev.type === TokenType.DELIMITER ||
  prev.type === TokenType.THEN ||
  prev.type === TokenType.ELSE ||
  (prev.type === TokenType.RESERVED_CLAUSE && /^(BEGIN|DO)\b/.test(prev.text));

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
