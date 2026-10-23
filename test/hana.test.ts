import dedent from 'dedent-js';

import { format as originalFormat, FormatFn } from '../src/sqlFormatter.js';
import { formatDialect, hana } from '../src/index.js';
import { FormatOptions } from '../src/FormatOptions.js';
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
  supportsConstraints(format, ['RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
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
  supportsOperators(format, [...standardOperators, '||'], { any: true });
  supportsJoin(format, { without: ['NATURAL'] });
  supportsSetOperations(format, [
    'UNION',
    'UNION ALL',
    'UNION DISTINCT',
    'EXCEPT',
    'EXCEPT DISTINCT',
    'INTERSECT',
    'INTERSECT DISTINCT',
  ]);
  supportsParams(format, { positional: true, named: [':'] });
  supportsLimiting(format, { limit: true, offset: true });
  supportsDataTypeCase(format);

  // Formatting must only change whitespace (and case, when configured)
  // and formatting the result again must not change it.
  const expectStableFormatting = (sql: string, cfg: Partial<FormatOptions> = {}) => {
    const result = format(sql, cfg);
    const normalize = (text: string) => {
      const noSpaces = text.replace(/\s+/g, '');
      return cfg.keywordCase === 'preserve' || !cfg.keywordCase ? noSpaces : noSpaces.toLowerCase();
    };
    expect(normalize(result)).toBe(normalize(sql));
    expect(format(result, cfg)).toBe(result);
    return result;
  };

  it('is exported as a dialect object for formatDialect()', () => {
    expect(formatDialect('SELECT a FROM DUMMY', { dialect: hana })).toBe(dedent`
      SELECT
        a
      FROM
        DUMMY
    `);
  });

  describe('lexical rules', () => {
    it('does not support backslash escapes in strings', () => {
      expect(format(`SELECT 'foo\\' AS a, 'bar' AS b FROM DUMMY`)).toBe(dedent`
        SELECT
          'foo\\' AS a,
          'bar' AS b
        FROM
          DUMMY
      `);
    });

    it('supports N and X prefixed literals', () => {
      expect(format(`SELECT N'ünicode''s', X'00FF', n'x', x'ab' FROM DUMMY`)).toBe(dedent`
        SELECT
          N'ünicode''s',
          X'00FF',
          n'x',
          x'ab'
        FROM
          DUMMY
      `);
    });

    it('supports # and $ in identifiers', () => {
      expect(format('SELECT col$1, col#2, from$, where# FROM tbl$x')).toBe(dedent`
        SELECT
          col$1,
          col#2,
          from$,
          where#
        FROM
          tbl$x
      `);
    });

    it('supports local temporary tables starting with #', () => {
      expect(format('CREATE LOCAL TEMPORARY TABLE #tmp (a INT); SELECT #tmp.a FROM #tmp;'))
        .toBe(dedent`
        CREATE LOCAL TEMPORARY TABLE #tmp (a INT);

        SELECT
          #tmp.a
        FROM
          #tmp;
      `);
    });

    it('supports => operator for named arguments', () => {
      expect(format('CALL proc_name(a => 1, b => ?, c => :v);')).toBe(dedent`
        CALL proc_name (a => 1, b => ?, c => :v);
      `);
    });

    it('keeps SQLScript :var reads as single tokens', () => {
      expect(format('SELECT * FROM :tv WHERE a = :v$1 AND b = :lt_x.col;')).toBe(dedent`
        SELECT
          *
        FROM
          :tv
        WHERE
          a = :v$1
          AND b = :lt_x.col;
      `);
    });

    it('formats array element access', () => {
      expect(format('x = :arr[1]; arr[2] = 5;')).toBe(dedent`
        x = :arr[1];

        arr[2] = 5;
      `);
    });

    it('supports SQLScript system variables', () => {
      expect(format('SELECT ::SQL_ERROR_CODE, ::SQL_ERROR_MESSAGE, ::ROWCOUNT FROM DUMMY;'))
        .toBe(dedent`
        SELECT
          ::SQL_ERROR_CODE,
          ::SQL_ERROR_MESSAGE,
          ::ROWCOUNT
        FROM
          DUMMY;
      `);
    });

    it('supports := assignment', () => {
      expect(format('v := :v + 1;')).toBe('v := :v + 1;');
    });
  });

  describe('vocabulary', () => {
    it('recognizes HANA data types', () => {
      const result = format(
        'CREATE COLUMN TABLE t (a seconddate, b nvarchar(10), c alphanum(5), d st_geometry(4326), e st_point, f shorttext(100), g smalldecimal, h bintext, i real_vector(3), j tinyint)',
        { dataTypeCase: 'upper' }
      );
      expect(result).toBe(dedent`
        CREATE COLUMN TABLE t (
          a SECONDDATE,
          b NVARCHAR(10),
          c ALPHANUM(5),
          d ST_GEOMETRY(4326),
          e ST_POINT,
          f SHORTTEXT(100),
          g SMALLDECIMAL,
          h BINTEXT,
          i REAL_VECTOR(3),
          j TINYINT
        )
      `);
    });

    it('converts HANA data types to lowercase', () => {
      expect(
        format('SELECT CAST(a AS NVARCHAR(10)), CAST(b AS SECONDDATE) FROM t', {
          dataTypeCase: 'lower',
        })
      ).toBe(dedent`
        SELECT
          CAST(a AS nvarchar(10)),
          CAST(b AS seconddate)
        FROM
          t
      `);
    });

    it('recognizes HANA built-in functions', () => {
      const result = format(
        `select add_days(d, 1), to_nvarchar(n), string_agg(s, ','), add_workdays('FC', d, 1), days_between(a, b), ifnull(x, 0), to_seconddate(t), current_utctimestamp from dummy`,
        { functionCase: 'upper', keywordCase: 'upper' }
      );
      expect(result).toBe(dedent`
        SELECT
          ADD_DAYS(d, 1),
          TO_NVARCHAR(n),
          STRING_AGG(s, ','),
          ADD_WORKDAYS('FC', d, 1),
          DAYS_BETWEEN(a, b),
          IFNULL(x, 0),
          TO_SECONDDATE(t),
          CURRENT_UTCTIMESTAMP
        FROM
          dummy
      `);
    });

    it('formats a call to a HANA built-in as a function call', () => {
      expect(format("SELECT ADD_DAYS (d, 1), TO_NVARCHAR (n), STRING_AGG (s, ',') FROM t"))
        .toBe(dedent`
        SELECT
          ADD_DAYS(d, 1),
          TO_NVARCHAR(n),
          STRING_AGG(s, ',')
        FROM
          t
      `);
    });

    it('converts HANA keywords', () => {
      expect(format('select top 10 a from t with hint (no_cs_join)', { keywordCase: 'upper' }))
        .toBe(dedent`
        SELECT
          TOP 10 a
        FROM
          t
        WITH HINT (no_cs_join)
      `);
    });
  });

  describe('queries', () => {
    it('formats SELECT TOP', () => {
      expect(format('SELECT TOP 10 * FROM t ORDER BY a;')).toBe(dedent`
        SELECT
          TOP 10 *
        FROM
          t
        ORDER BY
          a;
      `);
    });

    it('formats LIMIT with OFFSET', () => {
      expect(format('SELECT * FROM t LIMIT 10 OFFSET 20;')).toBe(dedent`
        SELECT
          *
        FROM
          t
        LIMIT
          10
        OFFSET
          20;
      `);
    });

    it('formats query hints', () => {
      expect(
        format('SELECT * FROM t1 JOIN t2 ON t1.a = t2.a WITH HINT (NO_CS_JOIN, USE_OLAP_PLAN);')
      ).toBe(dedent`
        SELECT
          *
        FROM
          t1
          JOIN t2 ON t1.a = t2.a
        WITH HINT (NO_CS_JOIN, USE_OLAP_PLAN);
      `);
    });

    it('formats join cardinality', () => {
      expect(format('SELECT * FROM t1 LEFT OUTER MANY TO ONE JOIN t2 ON t1.a = t2.a')).toBe(dedent`
        SELECT
          *
        FROM
          t1
          LEFT OUTER MANY TO ONE JOIN t2 ON t1.a = t2.a
      `);
    });

    it('formats GROUPING SETS', () => {
      expect(format('SELECT a, b, SUM(c) FROM t GROUP BY GROUPING SETS ((a), (b))')).toBe(dedent`
        SELECT
          a,
          b,
          SUM(c)
        FROM
          t
        GROUP BY
          GROUPING SETS ((a), (b))
      `);
    });

    it('formats FOR UPDATE and FOR SYSTEM_TIME', () => {
      expect(
        format(`SELECT * FROM t FOR UPDATE; SELECT * FROM t FOR SYSTEM_TIME AS OF '2020-01-01';`)
      ).toBe(dedent`
        SELECT
          *
        FROM
          t
        FOR UPDATE;

        SELECT
          *
        FROM
          t FOR SYSTEM_TIME AS OF '2020-01-01';
      `);
    });

    it('formats calculation view placeholders', () => {
      expect(
        format(`SELECT * FROM "_SYS_BIC"."pkg/CV_SALES" ('PLACEHOLDER' = ('$$p_year$$', '2020'));`)
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV_SALES" ('PLACEHOLDER' = ('$$p_year$$', '2020'));
      `);
      expect(format(`SELECT * FROM "pkg/CV_SALES" (PLACEHOLDER."$$p_year$$" => '2020');`))
        .toBe(dedent`
        SELECT
          *
        FROM
          "pkg/CV_SALES" (PLACEHOLDER."$$p_year$$" => '2020');
      `);
    });

    it('formats sequence access from DUMMY', () => {
      expect(format('SELECT seq.NEXTVAL, seq.CURRVAL FROM DUMMY;')).toBe(dedent`
        SELECT
          seq.NEXTVAL,
          seq.CURRVAL
        FROM
          DUMMY;
      `);
    });

    it('does not treat non-CTE WITH as common table expression', () => {
      expect(
        format(dedent`
          CREATE VIEW v AS SELECT a FROM t WITH READ ONLY;
          CREATE TABLE t2 AS (SELECT * FROM t) WITH NO DATA;
          GRANT SELECT ON t TO u WITH GRANT OPTION;
          SELECT * FROM UNNEST(:arr) WITH ORDINALITY AS x (a, n);
        `)
      ).toBe(dedent`
        CREATE VIEW v AS
        SELECT
          a
        FROM
          t WITH READ ONLY;

        CREATE TABLE t2 AS (
          SELECT
            *
          FROM
            t
        ) WITH NO DATA;

        GRANT SELECT ON t TO u WITH GRANT OPTION;

        SELECT
          *
        FROM
          UNNEST(:arr) WITH ORDINALITY AS x (a, n);
      `);
    });
  });

  describe('statements', () => {
    it('formats UPSERT ... WITH PRIMARY KEY', () => {
      expect(format(`UPSERT t (a, b) VALUES (1, 'x') WITH PRIMARY KEY;`)).toBe(dedent`
        UPSERT
          t (a, b)
        VALUES
          (1, 'x')
        WITH PRIMARY KEY;
      `);
    });

    it('formats UPSERT ... WHERE', () => {
      expect(format(`UPSERT t VALUES (1, 'x') WHERE a = 1;`)).toBe(dedent`
        UPSERT
          t
        VALUES
          (1, 'x')
        WHERE
          a = 1;
      `);
    });

    it('formats UPSERT with subquery', () => {
      expect(format(`UPSERT t SELECT * FROM s;`)).toBe(dedent`
        UPSERT
          t
        SELECT
          *
        FROM
          s;
      `);
    });

    it('formats REPLACE statement, but keeps REPLACE() function', () => {
      expect(
        format(`REPLACE t VALUES (1, 'x') WITH PRIMARY KEY; SELECT REPLACE(a, 'x', 'y') FROM t;`)
      ).toBe(dedent`
        REPLACE
          t
        VALUES
          (1, 'x')
        WITH PRIMARY KEY;

        SELECT
          REPLACE(a, 'x', 'y')
        FROM
          t;
      `);
    });

    it('formats CREATE COLUMN TABLE with hash partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT PRIMARY KEY, b NVARCHAR(10)) PARTITION BY HASH (a) PARTITIONS 4;'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT PRIMARY KEY, b NVARCHAR(10))
        PARTITION BY
          HASH (a) PARTITIONS 4;
      `);
    });

    it('formats CREATE COLUMN TABLE with range partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT, b INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION VALUE = 10, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b INT)
        PARTITION BY
          RANGE (a) (
            PARTITION 1 <= VALUES < 10,
            PARTITION VALUE = 10,
            PARTITION OTHERS
          );
      `);
    });

    it('formats CREATE COLUMN TABLE with multi-level partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT, b INT) PARTITION BY ROUNDROBIN PARTITIONS 4, RANGE (b) (PARTITION 0 <= VALUES < 5, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b INT)
        PARTITION BY
          ROUNDROBIN PARTITIONS 4,
          RANGE (b) (PARTITION 0 <= VALUES < 5, PARTITION OTHERS);
      `);
    });

    it('formats CREATE ROW / TEMPORARY TABLE', () => {
      expect(
        format(dedent`
          CREATE ROW TABLE t (a INT);
          CREATE LOCAL TEMPORARY COLUMN TABLE #t (a INT);
          CREATE GLOBAL TEMPORARY TABLE g (a INT) ON COMMIT PRESERVE ROWS;
        `)
      ).toBe(dedent`
        CREATE ROW TABLE t (a INT);

        CREATE LOCAL TEMPORARY COLUMN TABLE #t (a INT);

        CREATE GLOBAL TEMPORARY TABLE g (a INT) ON COMMIT PRESERVE ROWS;
      `);
    });

    it('formats ALTER TABLE ADD / DROP / ALTER', () => {
      expect(
        format(
          'ALTER TABLE t ADD (c INT); ALTER TABLE t DROP (c); ALTER TABLE t ALTER (c NVARCHAR(20));'
        )
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c INT);

        ALTER TABLE t
        DROP (c);

        ALTER TABLE t
        ALTER (c NVARCHAR(20));
      `);
    });

    it('formats sequences', () => {
      expect(
        format(dedent`
          CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 100 NO CYCLE;
          ALTER SEQUENCE seq RESTART WITH 10;
          DROP SEQUENCE seq;
        `)
      ).toBe(dedent`
        CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 100 NO CYCLE;

        ALTER SEQUENCE seq RESTART WITH 10;

        DROP SEQUENCE seq;
      `);
    });

    it('formats MERGE INTO', () => {
      expect(
        format(
          'MERGE INTO t USING s ON t.a = s.a WHEN MATCHED THEN UPDATE SET t.b = s.b WHEN NOT MATCHED THEN INSERT VALUES (s.a, s.b);'
        )
      ).toBe(dedent`
        MERGE INTO
          t USING s ON t.a = s.a
        WHEN MATCHED THEN
        UPDATE SET
          t.b = s.b
        WHEN NOT MATCHED THEN
        INSERT
        VALUES
          (s.a, s.b);
      `);
    });

    it('formats CREATE TRIGGER', () => {
      expect(
        format(
          'CREATE TRIGGER trg AFTER INSERT OR UPDATE OF a ON t REFERENCING NEW ROW nr FOR EACH ROW BEGIN INSERT INTO log VALUES (:nr.a); END;'
        )
      ).toBe(dedent`
        CREATE TRIGGER trg AFTER INSERT OR UPDATE OF a ON t REFERENCING NEW ROW nr FOR EACH ROW
        BEGIN
        INSERT INTO
          log
        VALUES
          (:nr.a);

        END;
      `);
    });
  });

  describe('SQLScript', () => {
    it('formats CREATE PROCEDURE', () => {
      expect(
        format(dedent`
          CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT))
          LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
          BEGIN
            DECLARE v INT DEFAULT 0;
            tv = SELECT x FROM t WHERE x > :a;
            b = SELECT * FROM :tv;
          END;
        `)
      ).toBe(dedent`
        CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT)) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
        BEGIN
        DECLARE v INT DEFAULT 0;

        tv =
        SELECT
          x
        FROM
          t
        WHERE
          x > :a;

        b =
        SELECT
          *
        FROM
          :tv;

        END;
      `);
    });

    it('formats CREATE FUNCTION', () => {
      expect(
        format(
          'CREATE FUNCTION f (a INT) RETURNS TABLE (x INT) LANGUAGE SQLSCRIPT AS BEGIN RETURN SELECT :a AS x FROM DUMMY; END;'
        )
      ).toBe(dedent`
        CREATE FUNCTION f (a INT)
        RETURNS TABLE (x INT) LANGUAGE SQLSCRIPT AS
        BEGIN
        RETURN
        SELECT
          :a AS x
        FROM
          DUMMY;

        END;
      `);
    });

    it('formats anonymous DO BEGIN ... END block', () => {
      expect(format('DO BEGIN DECLARE i INT = 0; SELECT :i FROM DUMMY; END;')).toBe(dedent`
        DO
        BEGIN
        DECLARE i INT = 0;

        SELECT
          :i
        FROM
          DUMMY;

        END;
      `);
    });

    it('formats IF ... ELSEIF ... ELSE ... END IF', () => {
      expect(format('IF :v > 0 THEN v = 1; ELSEIF :v < 0 THEN v = -1; ELSE v = 0; END IF;'))
        .toBe(dedent`
        IF :v > 0 THEN v = 1;

        ELSEIF :v < 0 THEN v = -1;

        ELSE v = 0;

        END IF;
      `);
    });

    it('formats loops', () => {
      expect(
        format(dedent`
          FOR i IN 1..10 DO x = :x + :i; END FOR;
          WHILE :i < 10 DO i = :i + 1; END WHILE;
          FOR r AS c DO BREAK; END FOR;
          LOOP CONTINUE; END LOOP;
        `)
      ).toBe(dedent`
        FOR i IN 1..10 DO x = :x + :i;

        END FOR;

        WHILE :i < 10 DO i = :i + 1;

        END WHILE;

        FOR r AS c DO
        BREAK;

        END FOR;

        LOOP
        CONTINUE;

        END LOOP;
      `);
    });

    it('formats cursors and exception handlers', () => {
      expect(
        format(dedent`
          DECLARE CURSOR c FOR SELECT a FROM t;
          DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_CODE FROM DUMMY;
          OPEN c;
          FETCH c INTO v;
          CLOSE c;
          SIGNAL SQL_ERROR_CODE 10001 SET MESSAGE_TEXT = 'oops';
        `)
      ).toBe(dedent`
        DECLARE CURSOR c FOR
        SELECT
          a
        FROM
          t;

        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        SELECT
          ::SQL_ERROR_CODE
        FROM
          DUMMY;

        OPEN c;

        FETCH c
        INTO
          v;

        CLOSE c;

        SIGNAL SQL_ERROR_CODE 10001 SET MESSAGE_TEXT = 'oops';
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL p(a => 1, b => :v, c => ?);')).toBe(dedent`
        CALL p (a => 1, b => :v, c => ?);
      `);
    });
  });

  describe('only changes whitespace and is idempotent', () => {
    [
      `UPSERT t (a, b) VALUES (1, 'x') WITH PRIMARY KEY;`,
      `UPSERT t VALUES (1, 'x') WHERE a = 1;`,
      `REPLACE t VALUES (1, 'x') WITH PRIMARY KEY;`,
      `CREATE COLUMN TABLE t (a INT PRIMARY KEY, b NVARCHAR(10), c SECONDDATE) PARTITION BY HASH (a) PARTITIONS 4;`,
      `CREATE COLUMN TABLE t (a INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION OTHERS);`,
      `CREATE ROW TABLE t (a INT); CREATE LOCAL TEMPORARY TABLE #tmp (a INT); CREATE GLOBAL TEMPORARY COLUMN TABLE g (a INT);`,
      `CREATE COLUMN TABLE t (a INT) PARTITION BY ROUNDROBIN PARTITIONS 4;`,
      `CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1; SELECT seq.NEXTVAL FROM DUMMY;`,
      `SELECT * FROM t1 JOIN t2 ON t1.a = t2.a WITH HINT (NO_CS_JOIN, USE_OLAP_PLAN);`,
      `MERGE INTO t USING s ON t.a = s.a WHEN MATCHED THEN UPDATE SET t.b = s.b WHEN NOT MATCHED THEN INSERT VALUES (s.a, s.b);`,
      `COMMENT ON TABLE t IS 'it''s a table'; COMMENT ON COLUMN t.a IS 'col';`,
      `SELECT * FROM "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$p$$', 'v'));`,
      `SELECT * FROM "_SYS_BIC"."pkg/CV" (PLACEHOLDER."$$p$$" => 'v');`,
      `SELECT TOP 5 N'x', X'FF', 'a\\', "q""id", a || b, #t.x, c$1 FROM t LIMIT 5 OFFSET 1;`,
      `WITH cte AS (SELECT a FROM DUMMY) SELECT * FROM cte;`,
      dedent`
        CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT))
        LANGUAGE SQLSCRIPT READS SQL DATA AS
        BEGIN
          DECLARE v INT DEFAULT 0;
          DECLARE arr INT ARRAY = ARRAY(1, 2, 3);
          tv = SELECT * FROM t WHERE x > :a;
          IF :v > 0 THEN
            v = :v + 1;
          ELSEIF :v < 0 THEN
            v := 0;
          ELSE
            v = :arr[1];
          END IF;
          FOR i IN 1..10 DO
            INSERT INTO t VALUES (:i);
          END FOR;
          WHILE :v < 10 DO
            v = :v + 1;
          END WHILE;
          b = SELECT * FROM :tv;
        END;
      `,
      `DO BEGIN DECLARE i INT; SELECT :i FROM DUMMY; END;`,
      `DO (IN a INT => 5) BEGIN SELECT :a FROM DUMMY; END;`,
      `CALL p(a => 1, b => ?);`,
      `DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_CODE, ::SQL_ERROR_MESSAGE FROM DUMMY;`,
    ].forEach(sql => {
      it(sql, () => {
        expectStableFormatting(sql);
        expectStableFormatting(sql, { keywordCase: 'lower', indentStyle: 'tabularLeft' });
        expectStableFormatting(sql, { indentStyle: 'tabularRight', denseOperators: true });
      });
    });
  });

  it('changes only case when keywordCase, dataTypeCase and functionCase are set', () => {
    const sql = `create procedure p (in a nvarchar(10)) language sqlscript as begin declare d seconddate = add_days(current_date, 1); select to_nvarchar(:d) from dummy; end;`;
    const cfg = { keywordCase: 'upper', dataTypeCase: 'upper', functionCase: 'upper' } as const;
    const result = format(sql, cfg);
    expect(result.replace(/\s+/g, '').toLowerCase()).toBe(sql.replace(/\s+/g, '').toLowerCase());
    expect(format(result, cfg)).toBe(result);
    expect(result).toBe(dedent`
      CREATE PROCEDURE p (IN a NVARCHAR(10)) LANGUAGE SQLSCRIPT AS
      BEGIN
      DECLARE d SECONDDATE = ADD_DAYS(CURRENT_DATE, 1);

      SELECT
        TO_NVARCHAR(:d)
      FROM
        dummy;

      END;
    `);
  });
});
