import dedent from 'dedent-js';

import { format as originalFormat, formatDialect, FormatFn } from '../src/sqlFormatter.js';
import { hana } from '../src/index.js';
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
  supportsOperators(format, [...standardOperators, '||', '=>']);
  supportsJoin(format, {
    without: ['NATURAL'],
    additionally: [
      'LEFT OUTER MANY TO ONE JOIN',
      'INNER ONE TO ONE JOIN',
      'RIGHT MANY TO EXACT ONE JOIN',
      'FULL OUTER EXACT ONE TO MANY JOIN',
      'MANY TO MANY JOIN',
    ],
  });
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

  it('is selectable through formatDialect() with the exported hana dialect object', () => {
    expect(formatDialect('SELECT TOP 1 * FROM DUMMY', { dialect: hana })).toBe(dedent`
      SELECT TOP 1
        *
      FROM
        DUMMY
    `);
  });

  describe('lexical rules', () => {
    it('does not treat backslash as escape character in strings', () => {
      expect(format("SELECT 'C:\\temp\\', 'it''s' FROM DUMMY;")).toBe(dedent`
        SELECT
          'C:\\temp\\',
          'it''s'
        FROM
          DUMMY;
      `);
    });

    it('supports N and X prefixed string literals', () => {
      expect(format("SELECT N'Ünïcödé', X'00FF', n'x', x'ab' FROM DUMMY;")).toBe(dedent`
        SELECT
          N'Ünïcödé',
          X'00FF',
          n'x',
          x'ab'
        FROM
          DUMMY;
      `);
    });

    it('supports # and $ in identifiers and #-prefixed local temporary tables', () => {
      expect(format('SELECT a$b, col#1, #tmp.c FROM #tmp JOIN tbl$x ON #tmp.id = tbl$x.id;'))
        .toBe(dedent`
        SELECT
          a$b,
          col#1,
          #tmp.c
        FROM
          #tmp
          JOIN tbl$x ON #tmp.id = tbl$x.id;
      `);
    });

    it('keeps :name variable references as single tokens', () => {
      expect(format('SELECT * FROM :lt_orders WHERE id = :p_id AND x = :"MyVar";')).toBe(dedent`
        SELECT
          *
        FROM
          :lt_orders
        WHERE
          id = :p_id
          AND x = :"MyVar";
      `);
    });

    it('supports SQLScript system variables', () => {
      expect(format('SELECT ::ROWCOUNT, ::SQL_ERROR_CODE, ::SQL_ERROR_MESSAGE FROM DUMMY;'))
        .toBe(dedent`
        SELECT
          ::ROWCOUNT,
          ::SQL_ERROR_CODE,
          ::SQL_ERROR_MESSAGE
        FROM
          DUMMY;
      `);
    });

    it('supports SQLScript array element access', () => {
      expect(format('arr[4] = 5; SELECT :arr[1] FROM DUMMY;')).toBe(dedent`
        arr[4] = 5;

        SELECT
          :arr[1]
        FROM
          DUMMY;
      `);
    });

    it('keeps ".." range operator intact', () => {
      expect(format('FOR i IN 1..10 DO x = :i; END FOR;')).toBe(dedent`
        FOR i IN 1..10 DO x = :i;

        END FOR;
      `);
      expect(format('FOR i IN 1 .. :n DO x = :i; END FOR;')).toBe(dedent`
        FOR i IN 1..:n DO x = :i;

        END FOR;
      `);
    });
  });

  describe('queries', () => {
    it('formats SELECT TOP', () => {
      expect(format('SELECT TOP 10 DISTINCT a, b FROM tbl ORDER BY a;')).toBe(dedent`
        SELECT TOP 10 DISTINCT
          a,
          b
        FROM
          tbl
        ORDER BY
          a;
      `);
    });

    it('formats SELECT TOP in tabular style', () => {
      expect(format('select top 5 * from tbl', { indentStyle: 'tabularLeft' })).toBe(dedent`
        select    top 5 *
        from      tbl
      `);
    });

    it('formats query hints', () => {
      expect(format('SELECT * FROM tbl WHERE a = 1 WITH HINT (NO_INLINE, IGNORE_PLAN_CACHE);'))
        .toBe(dedent`
        SELECT
          *
        FROM
          tbl
        WHERE
          a = 1
        WITH HINT (NO_INLINE, IGNORE_PLAN_CACHE);
      `);
    });

    it('formats FOR UPDATE and FOR SHARE LOCK', () => {
      expect(format('SELECT * FROM tbl FOR UPDATE NOWAIT; SELECT * FROM tbl FOR SHARE LOCK;'))
        .toBe(dedent`
        SELECT
          *
        FROM
          tbl
        FOR UPDATE
          NOWAIT;

        SELECT
          *
        FROM
          tbl
        FOR SHARE LOCK;
      `);
    });

    it('formats calculation view placeholders', () => {
      expect(
        format(
          `SELECT * FROM "_SYS_BIC"."pkg/CV_SALES" (PLACEHOLDER."$$P_DATE$$" => '20240101', "PLACEHOLDER"."$$P_REGION$$" => 'EU');`
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV_SALES" (
            PLACEHOLDER."$$P_DATE$$" => '20240101',
            "PLACEHOLDER"."$$P_REGION$$" => 'EU'
          );
      `);
    });

    it('formats legacy placeholder syntax', () => {
      expect(
        format(`SELECT * FROM "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$P_DATE$$', '20240101'));`)
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$P_DATE$$', '20240101'));
      `);
    });

    it('formats sequences with NEXTVAL and DUMMY', () => {
      expect(
        format(
          'CREATE SEQUENCE seq_id START WITH 100 INCREMENT BY 1 NO CYCLE; SELECT seq_id.NEXTVAL, seq_id.CURRVAL FROM DUMMY;'
        )
      ).toBe(dedent`
        CREATE SEQUENCE seq_id START WITH 100 INCREMENT BY 1 NO CYCLE;

        SELECT
          seq_id.NEXTVAL,
          seq_id.CURRVAL
        FROM
          DUMMY;
      `);
    });
  });

  describe('WITH', () => {
    it('does not treat WITH PRIMARY KEY, START WITH or WITH HINT as CTE', () => {
      expect(format('SELECT 1 FROM DUMMY WITH HINT (NO_INLINE)', { keywordCase: 'lower' })).toBe(
        dedent`
          select
            1
          from
            DUMMY
          with hint (NO_INLINE)
        `
      );
      expect(format('UPSERT tbl VALUES (1) WITH PRIMARY KEY')).toBe(dedent`
        UPSERT
          tbl
        VALUES
          (1)
        WITH PRIMARY KEY
      `);
      expect(format('CREATE SEQUENCE s START WITH 1')).toBe('CREATE SEQUENCE s START WITH 1');
    });

    it('does not treat other WITH options as CTE', () => {
      expect(
        format(
          'CREATE TABLE t2 AS (SELECT * FROM t1) WITH NO DATA; CREATE VIEW v AS SELECT * FROM t WITH READ ONLY;'
        )
      ).toBe(dedent`
        CREATE TABLE t2 AS (
          SELECT
            *
          FROM
            t1
        ) WITH NO DATA;

        CREATE VIEW v AS
        SELECT
          *
        FROM
          t WITH READ ONLY;
      `);
      expect(format('CREATE COLUMN TABLE t (a INT) WITH PARAMETERS (PARTITION_SPEC = 1);')).toBe(
        'CREATE COLUMN TABLE t (a INT) WITH PARAMETERS (PARTITION_SPEC = 1);'
      );
    });

    it('formats CTE inside a view definition', () => {
      expect(format('CREATE VIEW v AS WITH c (x) AS (SELECT 1 FROM DUMMY) SELECT x FROM c;'))
        .toBe(dedent`
        CREATE VIEW v AS
        WITH
          c (x) AS (
            SELECT
              1
            FROM
              DUMMY
          )
        SELECT
          x
        FROM
          c;
      `);
    });
  });

  describe('data manipulation', () => {
    it('formats UPSERT ... VALUES ... WITH PRIMARY KEY', () => {
      expect(format("UPSERT employees (id, name) VALUES (1, 'Jane') WITH PRIMARY KEY;"))
        .toBe(dedent`
        UPSERT
          employees (id, name)
        VALUES
          (1, 'Jane')
        WITH PRIMARY KEY;
      `);
    });

    it('formats UPSERT ... WHERE', () => {
      expect(format("UPSERT employees VALUES (1, 'Jane') WHERE id = 1;")).toBe(dedent`
        UPSERT
          employees
        VALUES
          (1, 'Jane')
        WHERE
          id = 1;
      `);
    });

    it('formats REPLACE statement and REPLACE() function', () => {
      expect(format("REPLACE tbl VALUES (1, REPLACE(a, 'x', 'y')) WITH PRIMARY KEY;")).toBe(dedent`
        REPLACE
          tbl
        VALUES
          (1, REPLACE(a, 'x', 'y'))
        WITH PRIMARY KEY;
      `);
    });

    it('formats MERGE INTO with HANA-specific syntax', () => {
      expect(
        format(
          'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.v = s.v WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.v);'
        )
      ).toBe(dedent`
        MERGE INTO
          target t USING source s ON t.id = s.id
        WHEN MATCHED THEN
        UPDATE SET
          t.v = s.v
        WHEN NOT MATCHED THEN
        INSERT
        VALUES
          (s.id, s.v);
      `);
    });
  });

  describe('data definition', () => {
    it('formats CREATE COLUMN TABLE with hash partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE sales (id INT PRIMARY KEY, region NVARCHAR(10), amount DECIMAL(15,2), created SECONDDATE) PARTITION BY HASH (id) PARTITIONS 4;'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE sales (
          id INT PRIMARY KEY,
          region NVARCHAR(10),
          amount DECIMAL(15, 2),
          created SECONDDATE
        )
        PARTITION BY
          HASH (id) PARTITIONS 4;
      `);
    });

    it('formats range partitions', () => {
      expect(
        format(
          'CREATE COLUMN TABLE p (a INT, b INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION 10 <= VALUES < 20, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE p (a INT, b INT)
        PARTITION BY
          RANGE (a) (
            PARTITION 1 <= VALUES < 10,
            PARTITION 10 <= VALUES < 20,
            PARTITION OTHERS
          );
      `);
    });

    it('formats ROW, LOCAL TEMPORARY and GLOBAL TEMPORARY tables', () => {
      expect(
        format(
          'CREATE ROW TABLE r (a INT); CREATE LOCAL TEMPORARY TABLE #tmp (a INT, b ALPHANUM(10)); CREATE GLOBAL TEMPORARY COLUMN TABLE gt (a INT) ON COMMIT PRESERVE ROWS;'
        )
      ).toBe(dedent`
        CREATE ROW TABLE r (a INT);

        CREATE LOCAL TEMPORARY TABLE #tmp (a INT, b ALPHANUM(10));

        CREATE GLOBAL TEMPORARY COLUMN TABLE gt (a INT) ON COMMIT PRESERVE ROWS;
      `);
    });

    it('formats ALTER TABLE ADD/DROP/ALTER', () => {
      expect(
        format(
          'ALTER TABLE t ADD (c INT, d NVARCHAR(5)); ALTER TABLE t DROP (c); ALTER TABLE t ALTER (d NVARCHAR(50));'
        )
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c INT, d NVARCHAR(5));

        ALTER TABLE t
        DROP (c);

        ALTER TABLE t
        ALTER (d NVARCHAR(50));
      `);
    });

    it('formats COMMENT ON', () => {
      expect(format("COMMENT ON COLUMN sales.amount IS 'Net amount';")).toBe(
        "COMMENT ON COLUMN sales.amount IS 'Net amount';"
      );
    });

    it('formats GRANT and REVOKE', () => {
      expect(
        format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA s TO u WITH GRANT OPTION; REVOKE SELECT ON t FROM u;'
        )
      ).toBe(dedent`
        GRANT
          SELECT,
          INSERT,
          UPDATE,
          DELETE ON SCHEMA s TO u WITH GRANT OPTION;

        REVOKE
          SELECT ON t FROM u;
      `);
    });

    it('formats CREATE TRIGGER', () => {
      expect(
        format(
          'CREATE TRIGGER trg AFTER INSERT OR UPDATE ON t REFERENCING NEW ROW new FOR EACH ROW BEGIN INSERT INTO log VALUES (:new.id); END;'
        )
      ).toBe(dedent`
        CREATE TRIGGER trg AFTER INSERT OR UPDATE ON t REFERENCING NEW ROW new FOR EACH ROW
        BEGIN
        INSERT INTO
          log
        VALUES
          (:new.id);

        END;
      `);
    });
  });

  describe('SQLScript', () => {
    it('formats CREATE PROCEDURE', () => {
      expect(
        format(dedent`
          CREATE PROCEDURE get_orders (IN p_id INT, OUT ot_orders TABLE (id INT, amount DECIMAL(10,2)))
          LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
          BEGIN
            DECLARE lv_count INT DEFAULT 0;
            lt_x = SELECT id, amount FROM orders WHERE id = :p_id;
            SELECT COUNT(*) INTO lv_count FROM :lt_x;
            IF :lv_count > 0 THEN
              ot_orders = SELECT * FROM :lt_x;
            ELSEIF :lv_count = 0 THEN
              lv_count := 1;
            ELSE
              lv_count = 2;
            END IF;
          END;
        `)
      ).toBe(dedent`
        CREATE PROCEDURE get_orders (
          IN p_id INT,
          OUT ot_orders TABLE (id INT, amount DECIMAL(10, 2))
        )
        LANGUAGE SQLSCRIPT
        SQL SECURITY INVOKER
        READS SQL DATA AS
        BEGIN
        DECLARE lv_count INT DEFAULT 0;

        lt_x =
        SELECT
          id,
          amount
        FROM
          orders
        WHERE
          id = :p_id;

        SELECT
          COUNT(*)
        INTO
          lv_count
        FROM
          :lt_x;

        IF :lv_count > 0 THEN ot_orders =
        SELECT
          *
        FROM
          :lt_x;

        ELSEIF :lv_count = 0 THEN lv_count := 1;

        ELSE lv_count = 2;

        END IF;

        END;
      `);
    });

    it('formats anonymous DO BEGIN ... END block', () => {
      expect(
        format(
          'DO BEGIN DECLARE i INT = 0; WHILE :i < 3 DO i = :i + 1; END WHILE; SELECT :i AS i FROM DUMMY; END;'
        )
      ).toBe(dedent`
        DO
        BEGIN
        DECLARE i INT = 0;

        WHILE :i < 3 DO i = :i + 1;

        END WHILE;

        SELECT
          :i AS i
        FROM
          DUMMY;

        END;
      `);
    });

    it('formats DECLARE with cursors and exit handlers', () => {
      expect(
        format(
          'DECLARE CURSOR c FOR SELECT a FROM t; DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_CODE FROM DUMMY;'
        )
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
      `);
    });

    it('distinguishes CASE ... END from END IF', () => {
      expect(format('IF :a > 0 THEN x = CASE WHEN :a > 1 THEN 1 ELSE 0 END; END IF; END WHILE;'))
        .toBe(dedent`
        IF :a > 0 THEN x = CASE
          WHEN :a > 1 THEN 1
          ELSE 0
        END;

        END IF;

        END WHILE;
      `);
    });

    it('formats CREATE FUNCTION returning a table', () => {
      expect(
        format(
          'CREATE FUNCTION f (p INT) RETURNS TABLE (a INT) LANGUAGE SQLSCRIPT AS BEGIN RETURN SELECT a FROM t WHERE a = :p; END;'
        )
      ).toBe(dedent`
        CREATE FUNCTION f (p INT)
        RETURNS TABLE (a INT)
        LANGUAGE SQLSCRIPT AS
        BEGIN
        RETURN
        SELECT
          a
        FROM
          t
        WHERE
          a = :p;

        END;
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL "MY_SCHEMA"."MY_PROC"(p_in => 1, p_out => ?) WITH OVERVIEW;')).toBe(
        'CALL "MY_SCHEMA"."MY_PROC" (p_in => 1, p_out => ?) WITH OVERVIEW;'
      );
    });
  });

  describe('unreserved clause words as identifiers', () => {
    const words = [
      'language',
      'returns',
      'open',
      'load',
      'do',
      'break',
      'continue',
      'signal',
      'resignal',
      'fetch',
      'close',
      'call',
      'annotate',
      'backup',
      'commit',
      'savepoint',
      'unload',
      'export',
      'import',
    ];

    words.forEach(word => {
      it(`formats ${word} as a plain column name`, () => {
        const sqls = [
          'SELECT id, name FROM t WHERE name = 1 ORDER BY name;',
          'INSERT INTO t (id, name) VALUES (1, 2);',
          "UPDATE t SET name = 'x' WHERE id = 1;",
          'CREATE COLUMN TABLE t (id INT, name NVARCHAR(10));',
        ];
        sqls.forEach(sql => {
          const withWord = sql.replace(/name/g, word);
          expect(format(withWord)).toBe(format(sql).replace(/name/g, word));
        });
      });
    });

    it('formats SELECT id, language FROM t like SELECT id, name FROM t', () => {
      expect(format('SELECT id, language FROM t')).toBe(dedent`
        SELECT
          id,
          language
        FROM
          t
      `);
    });

    it('formats LANGUAGE and RETURNS as identifiers inside procedure headers and bodies', () => {
      expect(
        format(
          'CREATE FUNCTION f (language NVARCHAR(2)) RETURNS TABLE (language NVARCHAR(2), open INT) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER AS BEGIN RETURN SELECT language, open FROM t WHERE language = :language; END;'
        )
      ).toBe(dedent`
        CREATE FUNCTION f (language NVARCHAR(2))
        RETURNS TABLE (language NVARCHAR(2), open INT)
        LANGUAGE SQLSCRIPT
        SQL SECURITY INVOKER AS
        BEGIN
        RETURN
        SELECT
          language,
          open
        FROM
          t
        WHERE
          language = :language;

        END;
      `);
    });

    it('keeps procedure header clauses in CREATE PROCEDURE with DEFAULT SCHEMA', () => {
      expect(
        format(
          'CREATE OR REPLACE PROCEDURE p (IN load INT) LANGUAGE SQLSCRIPT SQL SECURITY DEFINER DEFAULT SCHEMA s READS SQL DATA AS BEGIN SELECT :load FROM DUMMY; END;'
        )
      ).toBe(dedent`
        CREATE OR REPLACE PROCEDURE p (IN load INT)
        LANGUAGE SQLSCRIPT
        SQL SECURITY DEFINER
        DEFAULT SCHEMA s
        READS SQL DATA AS
        BEGIN
        SELECT
          :load
        FROM
          DUMMY;

        END;
      `);
    });

    it('keeps SQLScript statements as clauses at the start of a statement', () => {
      expect(
        format(
          'DO BEGIN DECLARE EXIT HANDLER FOR SQLEXCEPTION CALL log_err(); OPEN c; FETCH c INTO v; CLOSE c; LOOP CALL p(); BREAK; END LOOP; COMMIT; END;'
        )
      ).toBe(dedent`
        DO
        BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        CALL log_err ();

        OPEN c;

        FETCH c
        INTO
          v;

        CLOSE c;

        LOOP
        CALL p ();

        BREAK;

        END LOOP;

        COMMIT;

        END;
      `);
    });
  });

  describe('time travel queries', () => {
    it('keeps AS OF COMMIT ID on the FROM line', () => {
      expect(format('SELECT * FROM t AS OF COMMIT ID 5')).toBe(dedent`
        SELECT
          *
        FROM
          t AS OF COMMIT ID 5
      `);
    });

    it('keeps AS OF COMMIT ID before WHERE', () => {
      expect(format('SELECT a FROM t AS OF COMMIT ID 5 WHERE a > 1;')).toBe(dedent`
        SELECT
          a
        FROM
          t AS OF COMMIT ID 5
        WHERE
          a > 1;
      `);
    });

    it('keeps AS OF UTCTIMESTAMP on the FROM line', () => {
      expect(format("SELECT * FROM t AS OF UTCTIMESTAMP '2024-01-01 00:00:00' WHERE a = 1;"))
        .toBe(dedent`
        SELECT
          *
        FROM
          t AS OF UTCTIMESTAMP '2024-01-01 00:00:00'
        WHERE
          a = 1;
      `);
    });

    it('keeps AS OF COMMIT ID on the FROM line in tabular style', () => {
      expect(format('SELECT * FROM t AS OF COMMIT ID 5', { indentStyle: 'tabularLeft' })).toBe(
        dedent`
          SELECT    *
          FROM      t AS OF COMMIT ID 5
        `
      );
    });
  });

  describe('unreserved clause words in CASE expressions', () => {
    it('formats THEN open ELSE close as column names', () => {
      expect(format('SELECT CASE WHEN a = 1 THEN open ELSE close END AS x FROM t')).toBe(dedent`
        SELECT
          CASE
            WHEN a = 1 THEN open
            ELSE close
          END AS x
        FROM
          t
      `);
    });

    it('formats THEN load as a column name', () => {
      expect(format('SELECT CASE WHEN a = 1 THEN load ELSE 0 END AS x FROM t')).toBe(dedent`
        SELECT
          CASE
            WHEN a = 1 THEN load
            ELSE 0
          END AS x
        FROM
          t
      `);
    });

    it('formats a column after a CASE expression', () => {
      expect(format('SELECT CASE WHEN a = 1 THEN 1 ELSE 0 END AS flag, open FROM t')).toBe(dedent`
        SELECT
          CASE
            WHEN a = 1 THEN 1
            ELSE 0
          END AS flag,
          open
        FROM
          t
      `);
    });

    it('still starts a statement after THEN and ELSE of SQLScript IF', () => {
      expect(
        format(
          'IF :a > 0 THEN x = CASE WHEN :a > 1 THEN 1 ELSE 0 END; CALL p(); ELSE CALL q(); END IF;'
        )
      ).toBe(dedent`
        IF :a > 0 THEN x = CASE
          WHEN :a > 1 THEN 1
          ELSE 0
        END;

        CALL p ();

        ELSE
        CALL q ();

        END IF;
      `);
    });
  });

  describe('case of unreserved clause words', () => {
    it('applies identifierCase and not keywordCase to column names', () => {
      const sql = 'select ID, Language, Returns, OPEN, Load, Commit, call, Fetch, do from T';
      expect(format(sql, { keywordCase: 'upper', identifierCase: 'lower' })).toBe(dedent`
        SELECT
          id,
          language,
          returns,
          open,
          load,
          commit,
          call,
          fetch,
          do
        FROM
          t
      `);
      expect(format(sql, { keywordCase: 'lower', identifierCase: 'upper' })).toBe(dedent`
        select
          ID,
          LANGUAGE,
          RETURNS,
          OPEN,
          LOAD,
          COMMIT,
          CALL,
          FETCH,
          DO
        from
          T
      `);
    });

    it('applies identifierCase to column names in CASE expressions', () => {
      expect(
        format('select case when a = 1 then Open else Close end as x from t', {
          keywordCase: 'upper',
          identifierCase: 'lower',
        })
      ).toBe(dedent`
        SELECT
          CASE
            WHEN a = 1 THEN open
            ELSE close
          END AS x
        FROM
          t
      `);
    });

    it('applies keywordCase to these words where they are syntax', () => {
      expect(
        format(
          'while :i < 3 do i = :i + 1; end while; select * from t as of commit id 5; alter system savepoint; call p(); load t all;',
          { keywordCase: 'upper', identifierCase: 'lower' }
        )
      ).toBe(dedent`
        WHILE :i < 3 DO i = :i + 1;

        END WHILE;

        SELECT
          *
        FROM
          t AS OF COMMIT id 5;

        ALTER SYSTEM SAVEPOINT;

        CALL p ();

        LOAD t ALL;
      `);
    });
  });

  describe('idempotency of unreserved clause words and time travel', () => {
    const samples = [
      'SELECT id, language, returns, open, load FROM t WHERE language = 1 ORDER BY load;',
      'SELECT call, commit, fetch, close FROM t GROUP BY call;',
      'CREATE COLUMN TABLE t (language NVARCHAR(2), open INT, load INT);',
      "UPDATE t SET language = 'x', open = 1 WHERE load = 2;",
      'CREATE FUNCTION f (language NVARCHAR(2)) RETURNS TABLE (open INT) LANGUAGE SQLSCRIPT AS BEGIN RETURN SELECT open FROM t WHERE language = :language; END;',
      'DO BEGIN DECLARE EXIT HANDLER FOR SQLEXCEPTION CALL log_err(); OPEN c; FETCH c INTO v; CLOSE c; COMMIT; END;',
      'SELECT * FROM t AS OF COMMIT ID 5 WHERE a = 1;',
      "SELECT * FROM t AS OF UTCTIMESTAMP '2024-01-01 00:00:00';",
      'SELECT CASE WHEN a = 1 THEN open ELSE close END AS x FROM t;',
      'SELECT CASE WHEN a = 1 THEN load ELSE 0 END AS x FROM t;',
      'SELECT CASE WHEN a = 1 THEN 1 ELSE 0 END AS flag, open FROM t;',
      'IF :a > 0 THEN x = CASE WHEN :a > 1 THEN 1 ELSE 0 END; CALL p(); ELSE CALL q(); END IF;',
      'select ID, Language, Returns, OPEN, Load, Commit, call, Fetch, do from T;',
    ];

    const configs = [
      {},
      { keywordCase: 'upper', identifierCase: 'lower' } as const,
      { keywordCase: 'lower', identifierCase: 'upper' } as const,
      { indentStyle: 'tabularLeft' } as const,
      { indentStyle: 'tabularRight', newlineBeforeSemicolon: true } as const,
    ];

    samples.forEach(sql => {
      configs.forEach(cfg => {
        it(`formats idempotently with ${JSON.stringify(cfg)}: ${sql}`, () => {
          const once = format(sql, cfg);
          expect(format(once, cfg)).toBe(once);
        });
      });
    });
  });

  describe('vocabulary', () => {
    it('recognizes HANA data types', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a nvarchar(10), b seconddate, c alphanum(5), d shorttext(20), g st_geometry, p st_point(4326), e smalldecimal, f tinyint);',
          { dataTypeCase: 'upper' }
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (
          a NVARCHAR(10),
          b SECONDDATE,
          c ALPHANUM(5),
          d SHORTTEXT(20),
          g ST_GEOMETRY,
          p ST_POINT(4326),
          e SMALLDECIMAL,
          f TINYINT
        );
      `);
    });

    it('recognizes HANA built-in functions', () => {
      expect(
        format(
          "select add_days(d, 1), to_nvarchar(d, 'YYYY'), string_agg(n, ','), days_between(a, b), ifnull(x, 0), add_workdays('F', d, 2) from t",
          { functionCase: 'upper' }
        )
      ).toBe(dedent`
        select
          ADD_DAYS(d, 1),
          TO_NVARCHAR(d, 'YYYY'),
          STRING_AGG(n, ','),
          DAYS_BETWEEN(a, b),
          IFNULL(x, 0),
          ADD_WORKDAYS('F', d, 2)
        from
          t
      `);
    });

    it('converts HANA keywords case', () => {
      expect(
        format(
          'upsert t values (current_utctimestamp, sysuuid) with primary key; select top 1 * from dummy',
          { keywordCase: 'upper' }
        )
      ).toBe(dedent`
        UPSERT
          t
        VALUES
          (CURRENT_UTCTIMESTAMP, SYSUUID)
        WITH PRIMARY KEY;

        SELECT TOP 1
          *
        FROM
          dummy
      `);
    });
  });

  describe('idempotency', () => {
    const samples = [
      "UPSERT employees (id, name) VALUES (1, 'Jane') WITH PRIMARY KEY;",
      "UPSERT employees VALUES (1, 'Jane') WHERE id = 1;",
      'CREATE COLUMN TABLE sales (id INT PRIMARY KEY, region NVARCHAR(10), amount DECIMAL(15,2)) PARTITION BY HASH (id) PARTITIONS 4;',
      'CREATE COLUMN TABLE p (a INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION OTHERS);',
      'CREATE LOCAL TEMPORARY TABLE #tmp (a INT); INSERT INTO #tmp SELECT a FROM t;',
      'CREATE SEQUENCE s START WITH 1 INCREMENT BY 1; SELECT s.NEXTVAL FROM DUMMY;',
      'SELECT TOP 5 a, b FROM t WHERE c = :p WITH HINT (NO_INLINE);',
      `SELECT * FROM "_SYS_BIC"."pkg/CV" ("PLACEHOLDER"."$$P_DATE$$" => '20240101') LIMIT 10 OFFSET 5;`,
      'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.v = s.v WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.v);',
      "COMMENT ON TABLE t IS 'it''s a table';",
      'CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT)) LANGUAGE SQLSCRIPT READS SQL DATA AS BEGIN DECLARE v INT = 0; lt = SELECT x FROM t WHERE x > :a; IF :v = 0 THEN b = SELECT * FROM :lt; ELSE b = SELECT 1 AS x FROM DUMMY; END IF; FOR i IN 1..3 DO v = :v + :i; END FOR; END;',
      'DO BEGIN DECLARE arr INT ARRAY = ARRAY(1, 2); arr[3] = :arr[1]; CALL p(a => 1, b => lt_out); END;',
      'SELECT a FROM x LEFT OUTER MANY TO ONE JOIN y ON x.id = y.id UNION DISTINCT SELECT b FROM z;',
      'GRANT SELECT, UPDATE ON t TO u WITH GRANT OPTION;',
    ];

    const configs = [
      {},
      { keywordCase: 'lower', dataTypeCase: 'lower', functionCase: 'lower' } as const,
      { indentStyle: 'tabularLeft', denseOperators: true } as const,
      { indentStyle: 'tabularRight', newlineBeforeSemicolon: true } as const,
    ];

    samples.forEach(sql => {
      configs.forEach(cfg => {
        it(`formats idempotently with ${JSON.stringify(cfg)}: ${sql}`, () => {
          const once = format(sql, cfg);
          expect(format(once, cfg)).toBe(once);
        });
      });
    });

    it('changes only whitespace and keyword case', () => {
      samples.forEach(sql => {
        const strip = (s: string) => s.replace(/\s+/g, '');
        expect(strip(format(sql))).toBe(strip(sql));
        expect(strip(format(sql, { keywordCase: 'upper' })).toUpperCase()).toBe(
          strip(sql).toUpperCase()
        );
      });
    });
  });
});
