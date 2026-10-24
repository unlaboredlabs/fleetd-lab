import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { EOF_TOKEN, isToken, Token, TokenType } from '../../lexer/token.js';
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
  'FOR {JSON | XML}',
  'INTO',
  // Data manipulation
  // - insert:
  'INSERT INTO',
  'VALUES',
  // - update:
  'SET',
  // - merge:
  'MERGE INTO',
  'WHEN [NOT] MATCHED [THEN]',
  'UPDATE SET',
  'INSERT',
  // Data control
  'GRANT',
  'REVOKE',
]);

const standardOnelineClauses = expandPhrases([
  'CREATE [COLUMN | ROW | HISTORY COLUMN | {GLOBAL | LOCAL} TEMPORARY [COLUMN | ROW] | VIRTUAL] TABLE',
]);

const tabularOnelineClauses = expandPhrases([
  // - create:
  'CREATE [OR REPLACE] VIEW',
  // - upsert:
  'UPSERT',
  'WITH PRIMARY KEY',
  // - query hints:
  'WITH HINT',
  // - update:
  'UPDATE',
  // - delete:
  'DELETE FROM',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER TABLE',
  'ADD',
  'DROP',
  'ALTER',
  'RENAME COLUMN',
  // - truncate:
  'TRUNCATE TABLE',
  // - partitioning:
  'PARTITION BY {HASH | RANGE | ROUNDROBIN | LIST}',
  // https://help.sap.com/docs/SAP_HANA_PLATFORM/4fe29514fd584807ac9f2a04f6754767/20a4389775191014b5f5ac26f5c0c63a.html
  'ALTER {AUDIT POLICY | CREDENTIAL | FULLTEXT INDEX | FUNCTION | INDEX | LDAP PROVIDER | PROCEDURE | REMOTE SOURCE | ROLE | SCHEMA | SEQUENCE | STATISTICS | SYSTEM | USER | USERGROUP | VIEW | VIRTUAL TABLE}',
  'BACKUP DATA',
  'CALL',
  'COMMENT ON',
  'COMMIT [WORK]',
  'CONNECT',
  'CREATE AUDIT POLICY',
  'CREATE [OR REPLACE] FUNCTION',
  'CREATE [UNIQUE] [BTREE | CPBTREE | INVERTED {HASH | VALUE | INDIVIDUAL}] INDEX',
  'CREATE FULLTEXT INDEX',
  'CREATE GRAPH WORKSPACE',
  'CREATE [OR REPLACE] LIBRARY',
  'CREATE [OR REPLACE] PROCEDURE',
  'CREATE REMOTE SOURCE',
  'CREATE ROLE',
  'CREATE SCHEMA',
  'CREATE SEQUENCE',
  'CREATE STATISTICS',
  'CREATE [PUBLIC] SYNONYM',
  'CREATE [OR REPLACE] TRIGGER',
  'CREATE TYPE',
  'CREATE USER',
  'CREATE USERGROUP',
  'CREATE VIRTUAL FUNCTION',
  'DROP {AUDIT POLICY | CREDENTIAL | FULLTEXT INDEX | FUNCTION | GRAPH WORKSPACE | INDEX | LIBRARY | PROCEDURE | REMOTE SOURCE | ROLE | SCHEMA | SEQUENCE | STATISTICS | [PUBLIC] SYNONYM | TRIGGER | TYPE | USER | USERGROUP | VIEW}',
  'EXPLAIN PLAN [FOR]',
  'EXPORT',
  'IMPORT [FROM]',
  'LOCK TABLE',
  'MERGE DELTA OF',
  'REFRESH STATISTICS',
  'RENAME {TABLE | INDEX | SCHEMA}',
  'ROLLBACK [WORK] [TO SAVEPOINT]',
  'SAVEPOINT',
  'SET {SCHEMA | TRANSACTION | HISTORY SESSION TO}',
  'UNSET',
  // SQLScript
  // https://help.sap.com/docs/SAP_HANA_PLATFORM/de2486ee947e43e684d39702027f8a94/60088e3c2a8c4edda5ef1d2e4a9d0f41.html
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
  'OPEN',
  'FETCH',
  'CLOSE',
  'EXEC',
  'EXECUTE IMMEDIATE',
]);

// SQLScript statements that are only clauses when they begin a statement (see postProcess()).
// Elsewhere they are plain keywords (WHILE ... DO, DECLARE ... HANDLER FOR ...)
// or identifiers (SELECT open, close FROM prices).
const statementStartClauses = [
  'DO',
  'FOR',
  'LOOP',
  'BREAK',
  'CONTINUE',
  'RETURN',
  'SIGNAL',
  'RESIGNAL',
  'OPEN',
  'FETCH',
  'CLOSE',
  'EXEC',
];

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'EXCEPT [ALL | DISTINCT]',
  'INTERSECT [ALL | DISTINCT]',
]);

const reservedJoins = expandPhrases([
  'JOIN',
  '{LEFT | RIGHT | FULL} [OUTER] JOIN',
  '{INNER | CROSS} JOIN',
  // join cardinality
  '[INNER | {LEFT | RIGHT | FULL} [OUTER]] {MANY | ONE | EXACT ONE} TO {MANY | ONE | EXACT ONE} JOIN',
]);

const reservedKeywordPhrases = expandPhrases([
  'ON {UPDATE | DELETE} [CASCADE | RESTRICT | SET NULL | SET DEFAULT]',
  'ON COMMIT {DELETE | PRESERVE} ROWS',
  '{ROWS | RANGE} BETWEEN',
  'IF [NOT] EXISTS',
  'END {IF | FOR | WHILE | LOOP}',
  // WITH used outside of common table expressions
  '{START | RESTART} WITH',
  'WITH [NO] DATA',
  'WITH {GRANT | ADMIN} OPTION',
  'WITH {READ ONLY | CHECK OPTION}',
  'WITH {PARAMETERS | ORDINALITY | ASSOCIATIONS | ANNOTATIONS | CACHE | MASK}',
  'WITH STRUCTURED PRIVILEGE CHECK',
  'WITH EXPRESSION MACROS',
  'WITH RESULT VIEW',
  'WITH DEFAULT SCHEMA',
  'WITH ENCRYPTION',
  'WITHIN GROUP',
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
    // Local temporary tables start with #
    identChars: { first: '#', rest: '#$' },
    // SQLScript system variables: ::ROWCOUNT, ::SQL_ERROR_CODE, ...
    variableTypes: [{ regex: '::[A-Za-z_][A-Za-z0-9_]*' }],
    paramTypes: { positional: true, named: [':'] },
    operators: ['||', '=>', ':=', '..'],
    postProcess,
  },
  formatOptions: {
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
  },
};

function postProcess(tokens: Token[]): Token[] {
  let inGrantOrRevoke = false;

  return splitRanges(tokens).map((token, i, all) => {
    const prevToken = prevNonCommentToken(all, i);

    // GRANT SELECT, INSERT ON ... TO ...; REVOKE DELETE ON ... FROM ...;
    // Privileges and FROM are not clauses here
    if (token.type === TokenType.RESERVED_CLAUSE && ['GRANT', 'REVOKE'].includes(token.text)) {
      inGrantOrRevoke = true;
      return token;
    }
    if (inGrantOrRevoke) {
      if (token.type === TokenType.DELIMITER) {
        inGrantOrRevoke = false;
      } else if (
        token.type === TokenType.RESERVED_SELECT ||
        token.type === TokenType.RESERVED_CLAUSE
      ) {
        return { ...token, type: TokenType.RESERVED_KEYWORD };
      }
      return token;
    }

    if (
      token.type === TokenType.RESERVED_CLAUSE &&
      statementStartClauses.includes(token.text) &&
      !isStatementStart(prevToken)
    ) {
      return keywords.includes(token.text)
        ? { ...token, type: TokenType.RESERVED_KEYWORD }
        : { ...token, type: TokenType.IDENTIFIER, text: token.raw };
    }

    // VALUES inside partition specifications:
    // PARTITION 1 <= VALUES < 10, PARTITION VALUES = 5
    if (
      isToken.VALUES(token) &&
      ((prevToken.type === TokenType.OPERATOR && ['<', '<='].includes(prevToken.text)) ||
        (prevToken.type === TokenType.RESERVED_KEYWORD && prevToken.text === 'PARTITION'))
    ) {
      return { ...token, type: TokenType.RESERVED_KEYWORD };
    }

    return token;
  });
}

// True when token marks the start of a new (SQLScript) statement
function isStatementStart(token: Token): boolean {
  return (
    token === EOF_TOKEN ||
    token.type === TokenType.DELIMITER ||
    token.type === TokenType.THEN ||
    token.type === TokenType.ELSE ||
    (token.type === TokenType.RESERVED_CLAUSE && token.text.startsWith('BEGIN')) ||
    ((token.type === TokenType.RESERVED_CLAUSE || token.type === TokenType.RESERVED_KEYWORD) &&
      token.text === 'DO')
  );
}

function prevNonCommentToken(tokens: Token[], index: number): Token {
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].type !== TokenType.LINE_COMMENT && tokens[i].type !== TokenType.BLOCK_COMMENT) {
      return tokens[i];
    }
  }
  return EOF_TOKEN;
}

// The number pattern matches "1..10" as numbers "1." and ".10".
// Split these into the SQLScript range: 1 .. 10
function splitRanges(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      /^[0-9]+\.$/.test(token.text) &&
      next?.type === TokenType.NUMBER &&
      /^\.[0-9]+$/.test(next.text) &&
      !next.precedingWhitespace
    ) {
      const from = token.text.slice(0, -1);
      const to = next.text.slice(1);
      result.push(
        { ...token, raw: from, text: from },
        { type: TokenType.OPERATOR, raw: '..', text: '..', start: token.start + from.length },
        { ...next, raw: to, text: to, start: next.start + 1 }
      );
      i++;
    } else {
      result.push(token);
    }
  }
  return result;
}
