import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { EOF_TOKEN, isToken, Token, TokenType } from '../../lexer/token.js';
import { dataTypes, keywords } from './hana.keywords.js';
import { functions } from './hana.functions.js';

// Words that only start a clause at the beginning of a statement
// (or of a SQLScript block), elsewhere they are plain keywords,
// like the FOR in DECLARE EXIT HANDLER FOR SQLEXCEPTION.
const statementStartClauses = expandPhrases([
  'BREAK',
  'CLOSE',
  'CONTINUE',
  'DO',
  'EXEC',
  'EXECUTE IMMEDIATE',
  'FETCH',
  'FOR',
  'IF',
  'LOAD',
  'LOOP',
  'OPEN',
  'RESIGNAL',
  'RETURN',
  'SIGNAL',
  'UNLOAD',
  'WHILE',
]);

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
  // - upsert/replace:
  'WITH PRIMARY KEY',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER TABLE',
  'ADD',
  'ALTER',
  'DROP',
  'RENAME COLUMN',
  // - truncate:
  'TRUNCATE TABLE',
  // query hints
  'WITH HINT',
  // https://help.sap.com/docs/SAP_HANA_PLATFORM/4fe29514fd584807ac9f2a04f6754767/20a6791f751910148d2bfe3814192a01.html
  'ALTER {INDEX | FULLTEXT INDEX | FUNCTION | PROCEDURE | SCHEMA | SEQUENCE | STATISTICS | VIEW | VIRTUAL TABLE}',
  'ALTER {ROLE | USER | USERGROUP | SYSTEM | TRIGGER}',
  'CALL',
  'COMMENT ON',
  'COMMIT [WORK]',
  'CREATE [UNIQUE] [BTREE | CPBTREE | INVERTED HASH | INVERTED VALUE | INVERTED INDIVIDUAL] INDEX',
  'CREATE FULLTEXT INDEX',
  'CREATE [OR REPLACE] {FUNCTION | PROCEDURE | TRIGGER}',
  'CREATE [PUBLIC] SYNONYM',
  'CREATE {ROLE | SCHEMA | SEQUENCE | STATISTICS | TYPE | USER | USERGROUP}',
  'CREATE [OR REPLACE] LIBRARY',
  'CREATE REMOTE SOURCE',
  'CREATE VIRTUAL {FUNCTION | PROCEDURE}',
  'DROP {FULLTEXT INDEX | INDEX | FUNCTION | LIBRARY | PROCEDURE | REMOTE SOURCE | ROLE | SCHEMA | SEQUENCE}',
  'DROP {STATISTICS | [PUBLIC] SYNONYM | TRIGGER | TYPE | USER | USERGROUP | VIEW}',
  'EXPLAIN PLAN [SET STATEMENT_NAME]',
  'GRANT',
  'LOCK TABLE',
  'MERGE DELTA OF',
  'RENAME {TABLE | INDEX | SCHEMA}',
  'REVOKE',
  'ROLLBACK [TO SAVEPOINT]',
  'SAVEPOINT',
  'SET {SCHEMA | TRANSACTION}',
  // SQLScript
  'BEGIN [AUTONOMOUS TRANSACTION | PARALLEL EXECUTION | SEQUENTIAL EXECUTION]',
  'DECLARE',
  'ELSEIF',
  'RETURNS',
  ...statementStartClauses,
]);

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'EXCEPT [DISTINCT]',
  'INTERSECT [DISTINCT]',
]);

const reservedJoins = expandPhrases([
  'JOIN',
  '{LEFT | RIGHT | FULL} [OUTER] JOIN',
  '{INNER | CROSS} JOIN',
  // join cardinality
  '[INNER | {LEFT | RIGHT | FULL} [OUTER]] {MANY | ONE | EXACT ONE} TO {MANY | ONE | EXACT ONE} JOIN',
]);

const reservedKeywordPhrases = expandPhrases([
  'ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]',
  'ON COMMIT {DELETE | PRESERVE} ROWS',
  '{ROWS | RANGE} BETWEEN',
  'GROUPING SETS',
  '{START | RESTART} WITH',
  'RESET BY',
  'SET MESSAGE_TEXT',
  'END {IF | FOR | WHILE | LOOP}',
  'FOR {SYSTEM_TIME | APPLICATION_TIME}',
  // WITH ... clauses that are not common table expressions
  'WITH [NO] DATA',
  'WITH {GRANT | ADMIN} OPTION',
  'WITH CHECK OPTION',
  'WITH READ ONLY',
  'WITH ORDINALITY',
  'WITH PARAMETERS',
  'WITH STRUCTURED PRIVILEGE CHECK',
  'WITH ENCRYPTION',
  'WITH RESULT VIEW',
  'WITH [STATIC | DYNAMIC] CACHE',
  'WITH ASSOCIATIONS',
  'WITH EXPRESSION MACROS',
  'WITH ANONYMIZATION',
  'WITH MASK',
  'WITH REMOTE',
  'WITH DDL ONLY',
  'WITH RECONFIGURE',
]);

const reservedDataTypePhrases = expandPhrases([]);

// https://help.sap.com/docs/SAP_HANA_PLATFORM/4fe29514fd584807ac9f2a04f6754767/b4b0eec1968f41a099c828a4a6c8ca0f.html
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
    alwaysDenseOperators: ['..'],
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
  },
};

function postProcess(tokens: Token[]) {
  let prevToken: Token = EOF_TOKEN;
  // True inside GRANT and REVOKE statements
  let inGrant = false;

  return splitRangeOperators(tokens).map((token, i, allTokens) => {
    const nextToken = nextNonCommentToken(allTokens, i);
    let result = processToken(token, prevToken, nextToken);

    // GRANT SELECT, INSERT ON ... lists privileges, not clauses
    if (inGrant && (result.type === TokenType.RESERVED_CLAUSE || isReservedSelect(result))) {
      result = { ...result, type: TokenType.RESERVED_KEYWORD };
    }
    if (result.type === TokenType.DELIMITER) {
      inGrant = false;
    } else if (isGrantOrRevoke(result) && isStatementStart(prevToken)) {
      inGrant = true;
    }

    if (!isComment(token)) {
      prevToken = result;
    }
    return result;
  });
}

function processToken(token: Token, prevToken: Token, nextToken: Token): Token {
  const atStatementStart = isStatementStart(prevToken);

  // Trigger events: AFTER INSERT OR UPDATE OF col ON tbl
  if (
    token.type === TokenType.RESERVED_CLAUSE &&
    /^(INSERT|UPDATE)$/.test(token.text) &&
    prevToken.type === TokenType.RESERVED_KEYWORD &&
    /^(AFTER|BEFORE|OF|OR)$/.test(prevToken.text)
  ) {
    return { ...token, type: TokenType.RESERVED_KEYWORD };
  }

  // FOR, IF, WHILE, ... only start a clause at the beginning of a statement
  if (
    token.type === TokenType.RESERVED_CLAUSE &&
    statementStartClauses.includes(token.text) &&
    !atStatementStart
  ) {
    return { ...token, type: TokenType.RESERVED_KEYWORD };
  }

  // REPLACE statement (synonym of UPSERT), as opposed to the REPLACE() function
  if (
    token.type === TokenType.RESERVED_FUNCTION_NAME &&
    token.text === 'REPLACE' &&
    atStatementStart &&
    !(nextToken.type === TokenType.OPEN_PAREN && nextToken.text === '(')
  ) {
    return { ...token, type: TokenType.RESERVED_CLAUSE };
  }

  // OR between trigger events: AFTER INSERT OR UPDATE
  if (token.type === TokenType.OR && /^(INSERT|UPDATE|DELETE)$/.test(nextToken.text)) {
    return { ...token, type: TokenType.RESERVED_KEYWORD };
  }

  // Reading an element of an array variable: :arr[1]
  if (token.type === TokenType.NAMED_PARAMETER && isOpenBracket(nextToken)) {
    return { ...token, type: TokenType.IDENTIFIER };
  }

  // VALUES in range partitions: PARTITION 1 <= VALUES < 10, PARTITION VALUES = 5
  if (isToken.VALUES(token) && (isRangeOperator(prevToken) || isRangeOperator(nextToken))) {
    return { ...token, type: TokenType.RESERVED_KEYWORD };
  }

  return token;
}

// The number rule tokenizes the range 1..10 of a FOR loop as "1." and ".10",
// split it into "1", ".." and "10" instead.
function splitRangeOperators(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (
      token.type === TokenType.NUMBER &&
      /[0-9]\.$/.test(token.raw) &&
      nextToken &&
      !nextToken.precedingWhitespace &&
      ((nextToken.type === TokenType.NUMBER && /^\.[0-9]+$/.test(nextToken.raw)) ||
        nextToken.type === TokenType.PROPERTY_ACCESS_OPERATOR)
    ) {
      const number = token.raw.slice(0, -1);
      result.push({ ...token, raw: number, text: number });
      result.push({
        type: TokenType.OPERATOR,
        raw: '..',
        text: '..',
        start: nextToken.start - 1,
      });
      if (nextToken.type === TokenType.NUMBER) {
        const upperBound = nextToken.raw.slice(1);
        result.push({
          ...nextToken,
          raw: upperBound,
          text: upperBound,
          start: nextToken.start + 1,
        });
      }
      i++;
    } else {
      result.push(token);
    }
  }
  return result;
}

// True when the token preceding the current one marks the start of a statement
const isStatementStart = (prevToken: Token): boolean =>
  prevToken === EOF_TOKEN ||
  prevToken.type === TokenType.DELIMITER ||
  prevToken.type === TokenType.THEN ||
  prevToken.type === TokenType.ELSE ||
  ((prevToken.type === TokenType.RESERVED_CLAUSE ||
    prevToken.type === TokenType.RESERVED_KEYWORD) &&
    /^(BEGIN|DO|LOOP)\b/.test(prevToken.text));

const isOpenBracket = (token: Token): boolean =>
  token.type === TokenType.OPEN_PAREN && token.text === '[';

const isGrantOrRevoke = (token: Token): boolean =>
  token.type === TokenType.RESERVED_CLAUSE && /^(GRANT|REVOKE)$/.test(token.text);

const isReservedSelect = (token: Token): boolean => token.type === TokenType.RESERVED_SELECT;

const isRangeOperator = (token: Token): boolean =>
  token.type === TokenType.OPERATOR && ['<', '<=', '='].includes(token.text);

const isComment = (token: Token): boolean =>
  token.type === TokenType.LINE_COMMENT ||
  token.type === TokenType.BLOCK_COMMENT ||
  token.type === TokenType.DISABLE_COMMENT;

const nextNonCommentToken = (tokens: Token[], index: number): Token => {
  let i = index + 1;
  while (tokens[i] && isComment(tokens[i])) {
    i++;
  }
  return tokens[i] || EOF_TOKEN;
};
