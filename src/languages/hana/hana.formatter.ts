import { DialectOptions } from '../../dialect.js';
import { expandPhrases } from '../../expandPhrases.js';
import { functions } from './hana.functions.js';
import { dataTypes, keywords } from './hana.keywords.js';
import { postProcess } from './hana.postProcess.js';

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
  // Data manipulation
  // - insert:
  'INSERT [INTO]',
  'VALUES',
  // - update:
  'SET',
  // - upsert:
  'UPSERT',
  'REPLACE',
  // - merge:
  'MERGE INTO',
  'WHEN [NOT] MATCHED [THEN]',
  'UPDATE SET',
]);

const standardOnelineClauses = expandPhrases([
  'CREATE [ROW | COLUMN | HISTORY COLUMN | {GLOBAL | LOCAL} TEMPORARY [ROW | COLUMN] | VIRTUAL] TABLE',
]);

const tabularOnelineClauses = expandPhrases([
  // - select:
  'FOR UPDATE [OF]',
  'FOR SHARE LOCK [OF]',
  'FOR {JSON | XML}',
  'WITH HINT',
  // - upsert:
  'WITH PRIMARY KEY',
  // - create:
  'CREATE [OR REPLACE] [PROJECTION] VIEW',
  // - update:
  'UPDATE',
  'WHERE CURRENT OF',
  // - delete:
  'DELETE [HISTORY] FROM',
  // - drop table:
  'DROP TABLE',
  // - alter table:
  'ALTER TABLE',
  // - truncate:
  'TRUNCATE TABLE',
  // - rename:
  'RENAME {TABLE | COLUMN | INDEX | SCHEMA | DATABASE}',
  // procedures and functions
  'CREATE [OR REPLACE] [VIRTUAL] {PROCEDURE | FUNCTION}',
  'CREATE [OR REPLACE] TRIGGER',
  // other
  'SET SCHEMA',
  'EXPLAIN PLAN [FOR]',
  // Rest of the CREATE, ALTER and DROP statements,
  // and also the ADD, ALTER and DROP actions of ALTER TABLE
  'CREATE',
  'ALTER',
  'ADD',
  'DROP',
]);

const reservedSetOperations = expandPhrases([
  'UNION [ALL | DISTINCT]',
  'INTERSECT [DISTINCT]',
  'EXCEPT [DISTINCT]',
  'MINUS',
]);

const joinCardinality =
  '{MANY TO MANY | MANY TO ONE | MANY TO EXACT ONE | ONE TO MANY | EXACT ONE TO MANY | ONE TO ONE | EXACT ONE TO ONE | ONE TO EXACT ONE | EXACT ONE TO EXACT ONE}';

const reservedJoins = expandPhrases([
  'JOIN',
  '{LEFT | RIGHT | FULL} [OUTER] JOIN',
  '{INNER | CROSS} JOIN',
  // joins with cardinality, like: LEFT OUTER MANY TO ONE JOIN
  `[INNER | {LEFT | RIGHT | FULL} [OUTER]] ${joinCardinality} JOIN`,
  'LEFT OUTER MANY TO ONE CASE JOIN',
]);

const reservedKeywordPhrases = expandPhrases([
  'ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]',
  'ON COMMIT',
  '{ROWS | RANGE} BETWEEN',
  // These are not common table expressions
  '[RE]START WITH',
  'WITH {GRANT | ADMIN} OPTION',
  'WITH [NO] DATA',
  'WITH {CHECK OPTION | READ ONLY}',
  'WITH STRUCTURED PRIVILEGE CHECK',
  'WITH {ORDINALITY | PARAMETERS | ENCRYPTION | OVERVIEW | RECONFIGURE | CACHE}',
  'WITH RESULT VIEW',
  'WITH {ANNOTATIONS | ASSOCIATIONS | MASK}',
  'WITH DDL ONLY',
  // SQLScript
  'BEGIN {SEQUENTIAL EXECUTION | PARALLEL EXECUTION | AUTONOMOUS TRANSACTION}',
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
    // Single-quoted strings, with quotes escaped by doubling them:
    // - N'' for Unicode strings
    // - X'' for binary strings
    stringTypes: [
      { quote: "''-qq", prefixes: ['N'] },
      { quote: "''-raw", prefixes: ['X'], requirePrefix: true },
    ],
    identTypes: [`""-qq`],
    // Local temporary tables start with #
    identChars: { first: '#', rest: '#$' },
    // SQLScript system variables like ::ROWCOUNT and ::SQL_ERROR_CODE
    variableTypes: [{ regex: '::[A-Za-z_][A-Za-z0-9_]*' }],
    // Array element access in SQLScript like arr[1]
    extraParens: ['[]'],
    // :name is also used for reading SQLScript variables
    paramTypes: { positional: true, named: [':'] },
    operators: [
      // String concatenation
      '||',
      // Named arguments
      '=>',
      // SQLScript assignment
      ':=',
      // Range in SQLScript FOR loop: FOR i IN 1..10 DO
      '..',
    ],
    postProcess,
  },
  formatOptions: {
    onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
    tabularOnelineClauses,
  },
};
