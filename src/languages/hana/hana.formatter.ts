import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { EOF_TOKEN, isReserved, isToken, Token, TokenType } from '../../lexer/token.js';
import { functions } from './hana.functions.js';
import { dataTypes, keywords } from './hana.keywords.js';

// https://help.sap.com/doc/9b40bf74f8644b898fb07dabdd2a36ad/2.0.06/en-US/SAP_HANA_SQL_Reference_Guide_en.pdf
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
  'INSERT [INTO]',
  'VALUES',
  // - upsert:
  'UPSERT',
  // - update:
  'SET',
  // - merge:
  'MERGE INTO',
  'WHEN [NOT] MATCHED [THEN]',
  'UPDATE SET',
  // SQLScript blocks
  'BEGIN [AUTONOMOUS TRANSACTION | SEQUENTIAL EXECUTION | PARALLEL EXECUTION]',
  'DO BEGIN',
]);

const standardOnelineClauses = expandPhrases([
  'CREATE [ROW | COLUMN | HISTORY COLUMN | {GLOBAL | LOCAL} TEMPORARY [ROW | COLUMN] | VIRTUAL] TABLE',
]);

const tabularOnelineClauses = expandPhrases([
  // - create:
  'CREATE [OR REPLACE] [PROJECTION] VIEW',
  // - update:
  'UPDATE',
  // - delete:
  'DELETE [HISTORY] FROM',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER TABLE',
  'ADD',
  'DROP',
  // - truncate:
  'TRUNCATE TABLE',
  // - partitioning of CREATE TABLE and ALTER TABLE
  '[SUB]PARTITION BY {HASH | RANGE | ROUNDROBIN}',
  // - query hints and UPSERT
  'WITH HINT',
  'WITH PRIMARY KEY',
  // other DDL
  'RENAME {TABLE | COLUMN | INDEX}',
  'CREATE [UNIQUE] [BTREE | CPBTREE | INVERTED {HASH | VALUE | INDIVIDUAL}] INDEX',
  'CREATE FULLTEXT INDEX',
  'ALTER [FULLTEXT] INDEX',
  'DROP [FULLTEXT] INDEX',
  'ALTER VIEW',
  'DROP VIEW',
  'CREATE SEQUENCE',
  'ALTER SEQUENCE',
  'DROP SEQUENCE',
  'CREATE SCHEMA',
  'DROP SCHEMA',
  'SET SCHEMA',
  'CREATE [OR REPLACE] [PUBLIC] SYNONYM',
  'DROP [PUBLIC] SYNONYM',
  'CREATE [OR REPLACE] {PROCEDURE | FUNCTION | TRIGGER | LIBRARY}',
  'ALTER {PROCEDURE | FUNCTION | LIBRARY}',
  'DROP {PROCEDURE | FUNCTION | TRIGGER | LIBRARY}',
  'CREATE TYPE',
  'DROP TYPE',
  'CREATE [RESTRICTED] USER',
  'ALTER USER',
  'DROP USER',
  'CREATE ROLE',
  'DROP ROLE',
  'GRANT',
  'REVOKE',
  'CREATE REMOTE SOURCE',
  'ALTER REMOTE SOURCE',
  'DROP REMOTE SOURCE',
  'CREATE STATISTICS',
  'ALTER STATISTICS',
  'DROP STATISTICS',
  'CREATE GRAPH WORKSPACE',
  'DROP GRAPH WORKSPACE',
  'CREATE [OR REPLACE] CALCULATION SCENARIO',
  'COMMENT ON',
  'MERGE DELTA OF',
  'ALTER SYSTEM',
  'ALTER SESSION',
  'SET TRANSACTION',
  'LOCK TABLE',
  'LOAD',
  'UNLOAD',
  'IMPORT',
  'EXPORT',
  'EXPLAIN PLAN',
  'CONNECT',
  'COMMIT',
  'ROLLBACK',
  // SQLScript
  'CALL',
  'DO',
  'DECLARE',
  'EXEC',
  'EXECUTE IMMEDIATE',
  'SIGNAL',
  'RESIGNAL',
]);

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'EXCEPT [DISTINCT]',
  'INTERSECT [DISTINCT]',
  'MINUS [DISTINCT]',
]);

// HANA has no NATURAL joins, but supports join cardinality:
// LEFT OUTER MANY TO ONE JOIN
const joinCardinality = '[{MANY | ONE | EXACT ONE} TO {MANY | ONE | EXACT ONE}]';

const reservedJoins = expandPhrases([
  `[INNER] ${joinCardinality} JOIN`,
  `{LEFT | RIGHT | FULL} [OUTER] ${joinCardinality} JOIN`,
  'CROSS JOIN',
]);

const reservedKeywordPhrases = expandPhrases([
  'ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]',
  '{ROWS | RANGE} BETWEEN',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'GROUPING SETS',
  // sequences
  '[RE]START WITH',
  // non-CTE uses of WITH
  'WITH {GRANT | ADMIN} OPTION',
  'WITH CHECK OPTION',
  'WITH READ ONLY',
  'WITH [NO] DATA',
  'WITH ORDINALITY',
  'WITH PARAMETERS',
  'WITH RECONFIGURE',
  'WITH REPLACE',
  'WITH RESULT VIEW',
  'WITH STRUCTURED PRIVILEGE CHECK',
  // procedure and function headers
  'LANGUAGE {SQLSCRIPT | R | GRAPH | LLANG}',
  'SQL SECURITY {DEFINER | INVOKER}',
  'READS SQL DATA',
  'DEFAULT SCHEMA',
  // SQLScript SIGNAL and RESIGNAL
  'SET MESSAGE_TEXT',
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
    // HANA has no backslash escapes, quotes are escaped by doubling them
    stringTypes: [
      { quote: "''-qq", prefixes: ['N'] },
      { quote: "''-raw", prefixes: ['X'], requirePrefix: true },
    ],
    identTypes: [`""-qq`],
    // SQLScript system variables like ::SQL_ERROR_CODE and ::ROWCOUNT
    // (but not static methods like ST_Geometry::ST_GeomFromText(...))
    variableTypes: [{ regex: '::[A-Za-z_][A-Za-z0-9_]*\\b(?!\\s*\\()' }],
    // Local temporary tables start with #, e.g. #tmp
    identChars: { first: '#', rest: '#$' },
    extraParens: ['[]'],
    paramTypes: { positional: true, named: [':'] },
    operators: [
      // String and array concatenation
      '||',
      // Named arguments
      '=>',
      // SQLScript scalar assignment
      ':=',
      // SQLScript FOR loop range: FOR i IN 1..10 DO
      '..',
      // Static spatial methods: ST_Geometry::ST_GeomFromText(...)
      '::',
    ],
    postProcess,
  },
  formatOptions: {
    alwaysDenseOperators: ['..', '::'],
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
  },
};

function postProcess(tokens: Token[]): Token[] {
  return [
    splitRangeOperators,
    arrayVariablesToIdentifiers,
    cteNamesToIdentifiers,
    valuesInPartitionsToKeyword,
    fromInFunctionsToKeyword,
    privilegesToKeywords,
    markDoBlocks,
  ].reduce((result, transform) => transform(result), tokens);
}

// The number regex reads "1..10" as numbers "1." and ".10" (or "1." followed by "."),
// split these back to "1", "..", "10".
function splitRangeOperators(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      token.text.endsWith('.') &&
      next &&
      !next.precedingWhitespace &&
      next.text.startsWith('.') &&
      (next.type === TokenType.NUMBER || next.type === TokenType.PROPERTY_ACCESS_OPERATOR)
    ) {
      const number = token.text.slice(0, -1);
      result.push({ ...token, raw: number, text: number });
      result.push({
        type: TokenType.OPERATOR,
        raw: '..',
        text: '..',
        start: token.start + number.length,
      });
      if (next.type === TokenType.NUMBER) {
        const rest = next.text.slice(1);
        result.push({ ...next, raw: rest, text: rest, start: next.start + 1 });
      }
      i++;
    } else {
      result.push(token);
    }
  }
  return result;
}

// SQLScript array element access :arr[1] would otherwise be formatted as :arr [1]
function arrayVariablesToIdentifiers(tokens: Token[]): Token[] {
  return tokens.map((token, i) => {
    const next = tokens[i + 1];
    if (
      token.type === TokenType.NAMED_PARAMETER &&
      next &&
      next.type === TokenType.OPEN_PAREN &&
      next.text === '[' &&
      !next.precedingWhitespace
    ) {
      return { ...token, type: TokenType.IDENTIFIER, text: token.raw };
    }
    return token;
  });
}

// Phrases like WITH HINT or WITH DATA are matched by the tokenizer even when
// they're actually a CTE named "hint" or "data":
//
//   WITH hint AS (SELECT ...) SELECT ...
//   WITH data (a, b) AS (SELECT ...) SELECT ...
//
// Split these back to the WITH clause followed by an identifier.
function cteNamesToIdentifiers(tokens: Token[]): Token[] {
  const result: Token[] = [];
  tokens.forEach((token, i) => {
    const match = /^(WITH)(\s+)(\S+)$/iu.exec(token.raw);
    if (match && isReserved(token.type) && isFollowedByAs(tokens, i + 1)) {
      const [, withRaw, whitespace, nameRaw] = match;
      result.push({ ...token, type: TokenType.RESERVED_CLAUSE, raw: withRaw, text: 'WITH' });
      result.push({
        type: TokenType.IDENTIFIER,
        raw: nameRaw,
        text: nameRaw,
        start: token.start + withRaw.length + whitespace.length,
        precedingWhitespace: whitespace,
      });
    } else {
      result.push(token);
    }
  });
  return result;
}

// True when tokens[index] starts the rest of a CTE definition:
//
//   AS (...)
//   (col1, col2) AS (...)
function isFollowedByAs(tokens: Token[], index: number): boolean {
  let i = index;
  if (isOpenParen(tokens[i])) {
    i = matchingParenIndex(tokens, i) + 1;
  }
  return isAs(tokens[i]) && isOpenParen(tokens[i + 1]);
}

function matchingParenIndex(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.OPEN_PAREN) {
      depth++;
    } else if (tokens[i].type === TokenType.CLOSE_PAREN) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return tokens.length;
}

// In range partitions VALUES is not a clause:
//
//   PARTITION 1 <= VALUES < 10
function valuesInPartitionsToKeyword(tokens: Token[]): Token[] {
  return tokens.map((token, i) => {
    if (
      isToken.VALUES(token) &&
      (tokens[i - 1]?.type === TokenType.OPERATOR || tokens[i + 1]?.type === TokenType.OPERATOR)
    ) {
      return { ...token, type: TokenType.RESERVED_KEYWORD };
    }
    return token;
  });
}

// FROM inside EXTRACT(YEAR FROM d) and TRIM(BOTH ' ' FROM s) is not a clause
function fromInFunctionsToKeyword(tokens: Token[]): Token[] {
  const result = [...tokens];
  tokens.forEach((token, i) => {
    if (
      token.type === TokenType.RESERVED_FUNCTION_NAME &&
      (token.text === 'EXTRACT' || token.text === 'TRIM') &&
      isOpenParen(tokens[i + 1])
    ) {
      const closeIndex = matchingParenIndex(tokens, i + 1);
      let depth = 0;
      for (let j = i + 1; j < closeIndex; j++) {
        if (tokens[j].type === TokenType.OPEN_PAREN) {
          depth++;
        } else if (tokens[j].type === TokenType.CLOSE_PAREN) {
          depth--;
        } else if (depth === 1 && isClause(tokens[j], 'FROM')) {
          result[j] = { ...tokens[j], type: TokenType.RESERVED_KEYWORD };
        }
      }
    }
  });
  return result;
}

// Privileges of GRANT and REVOKE statements are not clauses:
//
//   GRANT SELECT, INSERT, UPDATE, DELETE ON t TO u
function privilegesToKeywords(tokens: Token[]): Token[] {
  let inPrivileges = false;
  return tokens.map(token => {
    if (token.type === TokenType.DELIMITER) {
      inPrivileges = false;
    } else if (inPrivileges && (isClause(token) || token.type === TokenType.RESERVED_SELECT)) {
      return { ...token, type: TokenType.RESERVED_KEYWORD };
    } else if (
      token.type === TokenType.RESERVED_CLAUSE &&
      (token.text === 'GRANT' || token.text === 'REVOKE')
    ) {
      inPrivileges = true;
    }
    return token;
  });
}

// DO starts an anonymous block only at the beginning of a statement:
//
//   DO BEGIN ... END;
//   DO (IN a INT => 1) BEGIN ... END;
//
// Elsewhere it belongs to a loop (WHILE ... DO, FOR ... DO) and is a plain keyword.
function markDoBlocks(tokens: Token[]): Token[] {
  const result: Token[] = [];
  let previousToken: Token = EOF_TOKEN;
  tokens.forEach(token => {
    const isStatementStart =
      previousToken === EOF_TOKEN || previousToken.type === TokenType.DELIMITER;
    if (isClause(token, 'DO') && !isStatementStart) {
      result.push({ ...token, type: TokenType.RESERVED_KEYWORD });
    } else if (isClause(token, 'DO BEGIN') && !isStatementStart) {
      // WHILE ... DO BEGIN ... END; END WHILE;
      const [, doRaw, whitespace, beginRaw] = /^(\S+)(\s+)(\S+)$/u.exec(token.raw) as string[];
      result.push({ ...token, type: TokenType.RESERVED_KEYWORD, raw: doRaw, text: 'DO' });
      result.push({
        ...token,
        raw: beginRaw,
        text: 'BEGIN',
        start: token.start + doRaw.length + whitespace.length,
        precedingWhitespace: whitespace,
      });
    } else {
      result.push(token);
    }
    if (!isComment(token)) {
      previousToken = token;
    }
  });
  return result;
}

const isClause = (token: Token, text?: string): boolean =>
  token.type === TokenType.RESERVED_CLAUSE && (text === undefined || token.text === text);

const isAs = (token: Token | undefined): boolean =>
  token?.type === TokenType.RESERVED_KEYWORD && token.text === 'AS';

const isOpenParen = (token: Token | undefined): boolean =>
  token?.type === TokenType.OPEN_PAREN && token.text === '(';

const isComment = (token: Token): boolean =>
  token.type === TokenType.LINE_COMMENT ||
  token.type === TokenType.BLOCK_COMMENT ||
  token.type === TokenType.DISABLE_COMMENT;
