import dedent from 'dedent-js';

import { format as originalFormat, FormatFn } from '../src/sqlFormatter.js';
import { formatDialect, hana, supportedDialects } from '../src/index.js';
import { createDialect } from '../src/dialect.js';
import behavesLikeSqlFormatter from './behavesLikeSqlFormatter.js';

import supportsAlterTable from './features/alterTable.js';
import supportsBetween from './features/between.js';
import supportsCommentOn from './features/commentOn.js';
import supportsComments from './features/comments.js';
import supportsConstraints from './features/constraints.js';
import supportsCreateTable from './features/createTable.js';
import supportsCreateView from './features/createView.js';
import supportsDeleteFrom from './features/deleteFrom.js';
import supportsDropTable from './features/dropTable.js';
import supportsIdentifiers from './features/identifiers.js';
import supportsInsertInto from './features/insertInto.js';
import supportsJoin from './features/join.js';
import supportsLimiting from './features/limiting.js';
import supportsMergeInto from './features/mergeInto.js';
import supportsNumbers from './features/numbers.js';
import supportsOperators, { standardOperators } from './features/operators.js';
import supportsSchema from './features/schema.js';
import supportsSetOperations from './features/setOperations.js';
import supportsStrings from './features/strings.js';
import supportsTruncateTable from './features/truncateTable.js';
import supportsUpdate from './features/update.js';
import supportsDataTypeCase from './options/dataTypeCase.js';
import supportsParams from './options/param.js';

describe('HanaFormatter', () => {
  const language = 'hana';
  const format: FormatFn = (query, cfg = {}) => originalFormat(query, { ...cfg, language });

  behavesLikeSqlFormatter(format);
  supportsNumbers(format);
  supportsComments(format);
  supportsCommentOn(format);
  supportsCreateView(format, { orReplace: true });
  supportsCreateTable(format);
  supportsDropTable(format);
  supportsConstraints(format, ['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT']);
  supportsAlterTable(format, { renameColumn: true });
  supportsDeleteFrom(format);
  supportsInsertInto(format);
  supportsUpdate(format);
  supportsTruncateTable(format);
  supportsMergeInto(format);
  supportsStrings(format, ["''-qq", "N''", "X''"]);
  supportsIdentifiers(format, [`""-qq`]);
  supportsBetween(format);
  supportsSchema(format);
  supportsOperators(format, [...standardOperators, '||', '=>', ':=']);
  supportsJoin(format, {
    without: ['NATURAL'],
    additionally: [
      'LEFT OUTER MANY TO ONE JOIN',
      'INNER ONE TO ONE JOIN',
      'MANY TO EXACT ONE JOIN',
    ],
  });
  supportsSetOperations(format, [
    'UNION',
    'UNION ALL',
    'UNION DISTINCT',
    'EXCEPT',
    'EXCEPT ALL',
    'EXCEPT DISTINCT',
    'INTERSECT',
    'INTERSECT ALL',
    'INTERSECT DISTINCT',
  ]);
  supportsParams(format, { positional: true, named: [':'] });
  supportsLimiting(format, { limit: true, offset: true });
  supportsDataTypeCase(format);

  // Tokens of the input, ignoring whitespace (also inside multi-word keywords)
  const tokenTexts = (sql: string) =>
    createDialect(hana)
      .tokenizer.tokenize(sql, {})
      .map(({ type, raw }) => `${type}:${raw.replace(/\s+/gu, ' ')}`);

  // Formatting must only change whitespace (and case, when configured),
  // and formatting the result again must not change anything.
  const expectStableFormatting = (sql: string) => {
    const formatted = format(sql);
    expect(tokenTexts(formatted)).toEqual(tokenTexts(sql));
    expect(format(formatted)).toBe(formatted);

    const upper = format(sql, {
      keywordCase: 'upper',
      dataTypeCase: 'upper',
      functionCase: 'upper',
    });
    expect(tokenTexts(upper).map(t => t.toUpperCase())).toEqual(
      tokenTexts(sql).map(t => t.toUpperCase())
    );
    expect(format(upper)).toBe(upper);

    const tabular = format(sql, { indentStyle: 'tabularLeft' });
    expect(tokenTexts(tabular)).toEqual(tokenTexts(sql));
    expect(format(tabular, { indentStyle: 'tabularLeft' })).toBe(tabular);
  };

  describe('dialect selection', () => {
    it('is listed in supportedDialects', () => {
      expect(supportedDialects).toContain('hana');
    });

    it('formats with the exported hana dialect object', () => {
      const sql = 'SELECT TOP 5 * FROM #tmp WITH HINT (NO_INLINE);';
      expect(formatDialect(sql, { dialect: hana })).toBe(format(sql));
      expect(formatDialect(sql, { dialect: hana })).toBe(dedent`
        SELECT
          TOP 5 *
        FROM
          #tmp
        WITH HINT (NO_INLINE);
      `);
    });
  });

  describe('lexical rules', () => {
    it('does not support backslash escapes in strings', () => {
      expect(format("SELECT 'C:\\temp\\' AS dir, 'it''s' FROM DUMMY;")).toBe(dedent`
        SELECT
          'C:\\temp\\' AS dir,
          'it''s'
        FROM
          DUMMY;
      `);
    });

    it('supports N and X prefixed literals', () => {
      expect(format("SELECT N'Grüße', x'00FF', X'' FROM DUMMY;")).toBe(dedent`
        SELECT
          N'Grüße',
          x'00FF',
          X''
        FROM
          DUMMY;
      `);
    });

    it('recognizes # and $ inside identifiers and local temporary tables starting with #', () => {
      expect(format('SELECT my$col, a#b, #tmp.c FROM #tmp, "My ""Table""";')).toBe(dedent`
        SELECT
          my$col,
          a#b,
          #tmp.c
        FROM
          #tmp,
          "My ""Table""";
      `);
    });

    it('keeps :name parameters as a single token', () => {
      expect(format('SELECT * FROM :lt WHERE id = :p_id AND name = ?;')).toBe(dedent`
        SELECT
          *
        FROM
          :lt
        WHERE
          id = :p_id
          AND name = ?;
      `);
      expect(format('SELECT :lt.a FROM :lt', { paramTypes: { named: [':'] } })).toBe(dedent`
        SELECT
          :lt.a
        FROM
          :lt
      `);
    });

    it('supports SQLScript system variables', () => {
      expect(format('SELECT ::SQL_ERROR_CODE, ::ROWCOUNT FROM DUMMY;')).toBe(dedent`
        SELECT
          ::SQL_ERROR_CODE,
          ::ROWCOUNT
        FROM
          DUMMY;
      `);
    });

    it('supports array element access', () => {
      expect(format('SELECT arr[1], CARDINALITY(:arr) FROM DUMMY;')).toBe(dedent`
        SELECT
          arr[1],
          CARDINALITY(:arr)
        FROM
          DUMMY;
      `);
    });
  });

  describe('vocabulary', () => {
    it('changes case of HANA data types', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a seconddate, b nvarchar(10), c alphanum(5), d st_geometry, e smalldecimal, f nclob);',
          { dataTypeCase: 'upper' }
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (
          a SECONDDATE,
          b NVARCHAR(10),
          c ALPHANUM(5),
          d ST_GEOMETRY,
          e SMALLDECIMAL,
          f NCLOB
        );
      `);
    });

    it('changes case of HANA built-in functions', () => {
      expect(
        format(
          "select add_days(d, 1), to_nvarchar(x), string_agg(n, ','), ifnull(a, 0), now() from dummy;",
          { functionCase: 'upper' }
        )
      ).toBe(dedent`
        select
          ADD_DAYS(d, 1),
          TO_NVARCHAR(x),
          STRING_AGG(n, ','),
          IFNULL(a, 0),
          NOW()
        from
          dummy;
      `);
    });

    it('changes case of HANA keywords', () => {
      expect(
        format('select top 1 current_utctimestamp, sysuuid from dummy;', { keywordCase: 'upper' })
      ).toBe(dedent`
        SELECT
          TOP 1 CURRENT_UTCTIMESTAMP,
          SYSUUID
        FROM
          dummy;
      `);
    });
  });

  describe('statements', () => {
    it('formats UPSERT ... VALUES ... WITH PRIMARY KEY', () => {
      expect(format("UPSERT t (a, b) VALUES (1, 'x') WITH PRIMARY KEY;")).toBe(dedent`
        UPSERT t (a, b)
        VALUES
          (1, 'x')
        WITH PRIMARY KEY;
      `);
    });

    it('formats UPSERT ... VALUES ... WHERE', () => {
      expect(format("UPSERT t VALUES (1, 'x') WHERE a = 1;")).toBe(dedent`
        UPSERT t
        VALUES
          (1, 'x')
        WHERE
          a = 1;
      `);
    });

    it('formats UPSERT with subquery', () => {
      expect(format('UPSERT t SELECT * FROM s;')).toBe(dedent`
        UPSERT t
        SELECT
          *
        FROM
          s;
      `);
    });

    it('formats CREATE COLUMN / ROW / TEMPORARY TABLE', () => {
      expect(
        format(dedent`
          CREATE COLUMN TABLE c (id INT PRIMARY KEY);
          CREATE ROW TABLE r (id INT);
          CREATE LOCAL TEMPORARY TABLE #tmp (id INT);
          CREATE LOCAL TEMPORARY COLUMN TABLE #tmp2 (id INT);
          CREATE GLOBAL TEMPORARY TABLE g (id INT) ON COMMIT PRESERVE ROWS;
        `)
      ).toBe(dedent`
        CREATE COLUMN TABLE c (id INT PRIMARY KEY);

        CREATE ROW TABLE r (id INT);

        CREATE LOCAL TEMPORARY TABLE #tmp (id INT);

        CREATE LOCAL TEMPORARY COLUMN TABLE #tmp2 (id INT);

        CREATE GLOBAL TEMPORARY TABLE g (id INT) ON COMMIT PRESERVE ROWS;
      `);
    });

    it('formats CREATE TABLE with hash partitioning', () => {
      expect(format('CREATE COLUMN TABLE t (a INT, b INT) PARTITION BY HASH (a) PARTITIONS 4;'))
        .toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b INT)
        PARTITION BY HASH (a) PARTITIONS 4;
      `);
    });

    it('formats CREATE TABLE with range partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT, b INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION VALUE = 20, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b INT)
        PARTITION BY RANGE (a) (
          PARTITION 1 <= VALUES < 10,
          PARTITION VALUE = 20,
          PARTITION OTHERS
        );
      `);
    });

    it('formats CREATE TABLE AS ... WITH [NO] DATA', () => {
      expect(format('CREATE COLUMN TABLE t2 AS (SELECT * FROM t) WITH NO DATA;')).toBe(dedent`
        CREATE COLUMN TABLE t2 AS (
          SELECT
            *
          FROM
            t
        ) WITH NO DATA;
      `);
    });

    it('formats ALTER TABLE ADD / DROP / ALTER', () => {
      expect(
        format(
          'ALTER TABLE t ADD (c NVARCHAR(10)); ALTER TABLE t ALTER (c NVARCHAR(20)); ALTER TABLE t DROP (c);'
        )
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c NVARCHAR(10));

        ALTER TABLE t
        ALTER (c NVARCHAR(20));

        ALTER TABLE t
        DROP (c);
      `);
    });

    it('formats sequences', () => {
      expect(
        format(dedent`
          CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 1000 NO CYCLE;
          ALTER SEQUENCE seq RESTART WITH 10;
          SELECT seq.NEXTVAL, seq.CURRVAL FROM DUMMY;
          INSERT INTO t VALUES (seq.NEXTVAL, 'x');
        `)
      ).toBe(dedent`
        CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 1000 NO CYCLE;

        ALTER SEQUENCE seq RESTART WITH 10;

        SELECT
          seq.NEXTVAL,
          seq.CURRVAL
        FROM
          DUMMY;

        INSERT INTO
          t
        VALUES
          (seq.NEXTVAL, 'x');
      `);
    });

    it('formats query hints', () => {
      expect(format('SELECT * FROM t WHERE a = 1 WITH HINT (NO_INLINE, USE_OLAP_PLAN);'))
        .toBe(dedent`
        SELECT
          *
        FROM
          t
        WHERE
          a = 1
        WITH HINT (NO_INLINE, USE_OLAP_PLAN);
      `);
    });

    it('does not treat other uses of WITH as common table expressions', () => {
      expect(
        format(dedent`
          GRANT SELECT, INSERT ON SCHEMA s TO u WITH GRANT OPTION;
          CREATE VIEW v AS SELECT a FROM t WITH READ ONLY;
        `)
      ).toBe(dedent`
        GRANT
          SELECT,
          INSERT ON SCHEMA s TO u WITH GRANT OPTION;

        CREATE VIEW v AS
        SELECT
          a
        FROM
          t WITH READ ONLY;
      `);
    });

    it('formats CTE together with hints', () => {
      expect(format('WITH c AS (SELECT a FROM t) SELECT * FROM c WITH HINT (NO_INLINE);'))
        .toBe(dedent`
        WITH
          c AS (
            SELECT
              a
            FROM
              t
          )
        SELECT
          *
        FROM
          c
        WITH HINT (NO_INLINE);
      `);
    });

    it('formats LIMIT ... OFFSET and TOP', () => {
      expect(format('SELECT TOP 10 a FROM t; SELECT a FROM t ORDER BY a LIMIT 10 OFFSET 20;'))
        .toBe(dedent`
        SELECT
          TOP 10 a
        FROM
          t;

        SELECT
          a
        FROM
          t
        ORDER BY
          a
        LIMIT
          10
        OFFSET
          20;
      `);
    });

    it('formats MERGE INTO', () => {
      expect(
        format(
          'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.a = s.a WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.a);'
        )
      ).toBe(dedent`
        MERGE INTO
          t USING s ON t.id = s.id
        WHEN MATCHED THEN
        UPDATE SET
          t.a = s.a
        WHEN NOT MATCHED THEN
        INSERT
        VALUES
          (s.id, s.a);
      `);
    });

    it('formats MERGE DELTA', () => {
      expect(format('MERGE DELTA OF t;')).toBe('MERGE DELTA OF t;');
    });

    it('formats calculation view placeholders', () => {
      expect(
        format(
          `SELECT * FROM "_SYS_BIC"."pkg/CV_SALES" (PLACEHOLDER."$$p_year$$" => '2024', PLACEHOLDER."$$p_region$$" => :region);`
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV_SALES" (
            PLACEHOLDER."$$p_year$$" => '2024',
            PLACEHOLDER."$$p_region$$" => :region
          );
      `);
      expect(
        format(`SELECT * FROM "CV" ('PLACEHOLDER' = ('$$p$$', 'x'));`, { keywordCase: 'upper' })
      ).toBe(dedent`
        SELECT
          *
        FROM
          "CV" ('PLACEHOLDER' = ('$$p$$', 'x'));
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL my_proc(a => 1, b => :lv, c => ?);')).toBe(dedent`
        CALL my_proc (a => 1, b => :lv, c => ?);
      `);
    });

    it('formats CREATE PROCEDURE with SQLScript body', () => {
      expect(
        format(dedent`
          CREATE PROCEDURE my_proc (IN p_id INT, OUT ot TABLE (id INT, name NVARCHAR(100)))
          LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
          BEGIN
            DECLARE lv_count INT DEFAULT 0;
            lt = SELECT id, name FROM t WHERE id = :p_id;
            SELECT COUNT(*) INTO lv_count FROM :lt;
            IF :lv_count > 0 THEN
              ot = SELECT * FROM :lt;
            ELSE
              ot = SELECT * FROM t;
            END IF;
          END;
        `)
      ).toBe(dedent`
        CREATE PROCEDURE my_proc (
          IN p_id INT,
          OUT ot TABLE (id INT, name NVARCHAR(100))
        ) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
        BEGIN
        DECLARE lv_count INT DEFAULT 0;

        lt =
        SELECT
          id,
          name
        FROM
          t
        WHERE
          id = :p_id;

        SELECT
          COUNT(*)
        INTO
          lv_count
        FROM
          :lt;

        IF :lv_count > 0 THEN ot =
        SELECT
          *
        FROM
          :lt;

        ELSE ot =
        SELECT
          *
        FROM
          t;

        END IF;

        END;
      `);
    });

    it('formats anonymous DO blocks', () => {
      expect(
        format('DO BEGIN DECLARE x INT = 1; IF :x > 0 THEN SELECT :x FROM DUMMY; END IF; END;')
      ).toBe(dedent`
        DO
        BEGIN
        DECLARE x INT = 1;

        IF :x > 0 THEN
        SELECT
          :x
        FROM
          DUMMY;

        END IF;

        END;
      `);
      expect(format('DO (IN a INT => 5) BEGIN SELECT :a FROM DUMMY; END;')).toBe(dedent`
        DO (IN a INT => 5)
        BEGIN
        SELECT
          :a
        FROM
          DUMMY;

        END;
      `);
    });

    it('formats SQLScript loops and handlers', () => {
      expect(
        format(dedent`
          BEGIN
            DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_MESSAGE FROM DUMMY;
            FOR i IN 1..10 DO lv = :lv + :i; END FOR;
            WHILE :lv < 100 DO lv = :lv + 1; END WHILE;
          END;
        `)
      ).toBe(dedent`
        BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        SELECT
          ::SQL_ERROR_MESSAGE
        FROM
          DUMMY;

        FOR i IN 1 .. 10 DO lv = :lv + :i;

        END FOR;

        WHILE :lv < 100 DO lv = :lv + 1;

        END WHILE;

        END;
      `);
    });

    it('formats SQLScript cursors', () => {
      expect(
        format('BEGIN DECLARE CURSOR c FOR SELECT a FROM t; OPEN c; FETCH c INTO v; CLOSE c; END;')
      ).toBe(dedent`
        BEGIN
        DECLARE CURSOR c FOR
        SELECT
          a
        FROM
          t;

        OPEN c;

        FETCH c
        INTO
          v;

        CLOSE c;

        END;
      `);
    });

    it('does not treat SQLScript statement words as clauses elsewhere', () => {
      expect(
        format('SELECT open, close, fetch FROM prices WHERE signal = 1;', { keywordCase: 'upper' })
      ).toBe(dedent`
        SELECT
          open,
          close,
          fetch
        FROM
          prices
        WHERE
          SIGNAL = 1;
      `);
    });
  });

  describe('idempotence and token preservation', () => {
    [
      "SELECT TOP 10 a, N'x', X'00' FROM #tmp WHERE b = 'it''s' AND c = :p WITH HINT (NO_INLINE);",
      "UPSERT t (a, b) VALUES (1, 'x') WITH PRIMARY KEY; UPSERT t VALUES (1, 'x') WHERE a = 1;",
      'CREATE COLUMN TABLE t (a INT PRIMARY KEY, b NVARCHAR(10), c SECONDDATE) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION OTHERS);',
      'CREATE LOCAL TEMPORARY TABLE #tmp (a ALPHANUM(10), g ST_GEOMETRY);',
      'CREATE SEQUENCE s START WITH 1 INCREMENT BY 1; SELECT s.NEXTVAL FROM DUMMY;',
      'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.a = s.a WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.a);',
      `COMMENT ON COLUMN t.a IS 'x'; SELECT * FROM "CV" (PLACEHOLDER."$$p$$" => 'x');`,
      "CALL p(a => 1, b => :lv); SELECT ADD_DAYS(d, 1), TO_NVARCHAR(d), STRING_AGG(n, ',') FROM t;",
      dedent`
        CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT)) LANGUAGE SQLSCRIPT AS
        BEGIN
          DECLARE v INT DEFAULT 0;
          lt = SELECT x FROM t WHERE y = :a;
          IF :v > 0 THEN b = SELECT * FROM :lt; ELSEIF :v = 0 THEN b = SELECT 0 AS x FROM DUMMY; ELSE b = SELECT 1 AS x FROM DUMMY; END IF;
          FOR i IN 1..3 DO v = :v + :i; END FOR;
          WHILE :v < 10 DO v := :v + 1; END WHILE;
        END;
        DO BEGIN DECLARE x INT = 1; SELECT :x FROM DUMMY; END;
      `,
      'WITH c AS (SELECT 1 AS a FROM DUMMY) SELECT * FROM c LEFT OUTER MANY TO ONE JOIN d ON c.a = d.a;',
    ].forEach(sql => {
      it(`keeps tokens and is idempotent: ${sql.slice(0, 40)}...`, () => {
        expectStableFormatting(sql);
      });
    });
  });
});
