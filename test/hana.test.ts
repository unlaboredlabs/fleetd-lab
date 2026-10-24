import dedent from 'dedent-js';

import {
  format as originalFormat,
  formatDialect,
  FormatFn,
  supportedDialects,
} from '../src/sqlFormatter.js';
import { hana } from '../src/index.js';
import behavesLikeSqlFormatter from './behavesLikeSqlFormatter.js';

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
  supportsCreateTable(format, { columnComment: true });
  supportsDropTable(format);
  supportsConstraints(format, ['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT']);
  supportsDeleteFrom(format);
  supportsInsertInto(format);
  supportsUpdate(format);
  supportsTruncateTable(format);
  supportsMergeInto(format);
  supportsStrings(format, ["''-qq", "N''", "X''"]);
  supportsIdentifiers(format, [`""-qq`]);
  supportsBetween(format);
  supportsSchema(format);
  supportsOperators(format, [...standardOperators, '||', '=>', ':='], { any: true });
  supportsJoin(format, { without: ['NATURAL'], supportsUsing: false });
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

  it('is selectable as a language and exported as a dialect object', () => {
    expect(supportedDialects).toContain('hana');
    expect(formatDialect('SELECT a FROM DUMMY', { dialect: hana })).toBe(dedent`
      SELECT
        a
      FROM
        DUMMY
    `);
  });

  describe('lexical rules', () => {
    it('does not treat backslash as an escape character in strings', () => {
      expect(format("SELECT 'C:\\temp\\', 'It''s' FROM DUMMY;")).toBe(dedent`
        SELECT
          'C:\\temp\\',
          'It''s'
        FROM
          DUMMY;
      `);
    });

    it("supports N'' unicode and X'' binary string literals", () => {
      expect(format("SELECT n'unicode', N'It''s', x'00ff', X'AB' FROM DUMMY;")).toBe(dedent`
        SELECT
          n'unicode',
          N'It''s',
          x'00ff',
          X'AB'
        FROM
          DUMMY;
      `);
    });

    it('supports delimited identifiers with doubled quotes', () => {
      expect(format('SELECT "my ""quoted"" col", "Schema"."Table".id FROM "Schema"."Table";'))
        .toBe(dedent`
          SELECT
            "my ""quoted"" col",
            "Schema"."Table".id
          FROM
            "Schema"."Table";
        `);
    });

    it('supports # and $ in identifiers and local temporary tables starting with #', () => {
      expect(format('SELECT col#1, col$2, #tmp.a FROM #tmp;')).toBe(dedent`
        SELECT
          col#1,
          col$2,
          #tmp.a
        FROM
          #tmp;
      `);
    });

    it('does not split keywords followed by # or $', () => {
      expect(format('SELECT select$x, from#y FROM t;')).toBe(dedent`
        SELECT
          select$x,
          from#y
        FROM
          t;
      `);
    });

    it('keeps :name parameters (SQLScript variables) as single tokens', () => {
      expect(format('SELECT * FROM :tv WHERE id=:p_id AND name = ?;')).toBe(dedent`
        SELECT
          *
        FROM
          :tv
        WHERE
          id = :p_id
          AND name = ?;
      `);
      expect(format('SELECT :tv.id FROM :tv WHERE a = :b', { denseOperators: true })).toBe(dedent`
        SELECT
          :tv.id
        FROM
          :tv
        WHERE
          a=:b
      `);
    });

    it('replaces :name parameters', () => {
      expect(format('SELECT * FROM t WHERE a = :p_a;', { params: { p_a: "'x'" } })).toBe(dedent`
        SELECT
          *
        FROM
          t
        WHERE
          a = 'x';
      `);
    });

    it('formats SQLScript array element access', () => {
      expect(format('SELECT :arr[1], CARDINALITY(:arr) FROM DUMMY;')).toBe(dedent`
        SELECT
          :arr[1],
          CARDINALITY(:arr)
        FROM
          DUMMY;
      `);
      expect(format('arr[:i] = :i * 2;')).toBe('arr[:i] = :i * 2;');
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

    it('formats static spatial methods without spaces around ::', () => {
      expect(format("SELECT ST_Geometry::ST_GeomFromText('POINT(1 1)', 4326) FROM DUMMY;"))
        .toBe(dedent`
          SELECT
            ST_Geometry::ST_GeomFromText('POINT(1 1)', 4326)
          FROM
            DUMMY;
        `);
    });

    it('formats FOR loop ranges without spaces around ..', () => {
      expect(format('FOR i IN 1..10 DO x := :x + :i; END FOR;')).toBe(dedent`
        FOR i IN 1..10 DO x := :x + :i;

        END FOR;
      `);
      expect(format('FOR i IN :a .. :b DO x := :i; END FOR;')).toBe(dedent`
        FOR i IN :a..:b DO x := :i;

        END FOR;
      `);
    });
  });

  describe('queries', () => {
    it('formats SELECT TOP', () => {
      expect(format('SELECT TOP 10 DISTINCT a, b FROM t ORDER BY a;')).toBe(dedent`
        SELECT
          TOP 10 DISTINCT a,
          b
        FROM
          t
        ORDER BY
          a;
      `);
    });

    it('does not support NATURAL joins', () => {
      expect(format('SELECT * FROM a NATURAL JOIN b;')).toBe(dedent`
        SELECT
          *
        FROM
          a NATURAL
          JOIN b;
      `);
    });

    it('supports join cardinality', () => {
      expect(
        format(
          'SELECT * FROM a LEFT OUTER MANY TO ONE JOIN b ON a.id = b.id INNER EXACT ONE TO ONE JOIN c ON c.id = a.id;'
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          a
          LEFT OUTER MANY TO ONE JOIN b ON a.id = b.id
          INNER EXACT ONE TO ONE JOIN c ON c.id = a.id;
      `);
    });

    it('supports MINUS as synonym for EXCEPT', () => {
      expect(format('SELECT a FROM t MINUS SELECT a FROM u;')).toBe(dedent`
        SELECT
          a
        FROM
          t
        MINUS
        SELECT
          a
        FROM
          u;
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

    it('formats FROM in EXTRACT() and TRIM() as part of the function call', () => {
      expect(format("SELECT EXTRACT(YEAR FROM d), TRIM(BOTH ' ' FROM s) FROM t;")).toBe(dedent`
        SELECT
          EXTRACT(YEAR FROM d),
          TRIM(BOTH ' ' FROM s)
        FROM
          t;
      `);
    });

    it('formats calculation views with placeholders', () => {
      expect(
        format(
          `SELECT * FROM "_SYS_BIC"."sales/CV_SALES" ('PLACEHOLDER' = ('$$IP_YEAR$$', '2024'), 'PLACEHOLDER' = ('$$IP_REGION$$', 'EMEA')) WHERE amount > 100;`
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."sales/CV_SALES" (
            'PLACEHOLDER' = ('$$IP_YEAR$$', '2024'),
            'PLACEHOLDER' = ('$$IP_REGION$$', 'EMEA')
          )
        WHERE
          amount > 100;
      `);
      expect(format(`SELECT * FROM cv_sales (PLACEHOLDER."$$IP_YEAR$$" => '2024');`)).toBe(dedent`
        SELECT
          *
        FROM
          cv_sales (PLACEHOLDER."$$IP_YEAR$$" => '2024');
      `);
    });
  });

  describe('UPSERT', () => {
    it('formats UPSERT ... VALUES ... WITH PRIMARY KEY', () => {
      expect(format("UPSERT customers (id, name) VALUES (1, 'Smith') WITH PRIMARY KEY;"))
        .toBe(dedent`
          UPSERT
            customers (id, name)
          VALUES
            (1, 'Smith')
          WITH PRIMARY KEY;
        `);
    });

    it('formats UPSERT ... VALUES ... WHERE', () => {
      expect(format("UPSERT customers VALUES (1, 'Smith') WHERE id = 1;")).toBe(dedent`
        UPSERT
          customers
        VALUES
          (1, 'Smith')
        WHERE
          id = 1;
      `);
    });

    it('formats UPSERT with subquery', () => {
      expect(format('UPSERT customers (id, name) SELECT id, name FROM staging;')).toBe(dedent`
        UPSERT
          customers (id, name)
        SELECT
          id,
          name
        FROM
          staging;
      `);
    });
  });

  describe('CREATE TABLE', () => {
    it('formats table types', () => {
      expect(
        format(dedent`
          CREATE COLUMN TABLE c (a INT);
          CREATE ROW TABLE r (a INT);
          CREATE HISTORY COLUMN TABLE h (a INT);
          CREATE LOCAL TEMPORARY TABLE #l (a INT);
          CREATE LOCAL TEMPORARY COLUMN TABLE #lc (a INT);
          CREATE GLOBAL TEMPORARY TABLE g (a INT);
          CREATE GLOBAL TEMPORARY COLUMN TABLE gc (a INT);
        `)
      ).toBe(dedent`
        CREATE COLUMN TABLE c (a INT);

        CREATE ROW TABLE r (a INT);

        CREATE HISTORY COLUMN TABLE h (a INT);

        CREATE LOCAL TEMPORARY TABLE #l (a INT);

        CREATE LOCAL TEMPORARY COLUMN TABLE #lc (a INT);

        CREATE GLOBAL TEMPORARY TABLE g (a INT);

        CREATE GLOBAL TEMPORARY COLUMN TABLE gc (a INT);
      `);
    });

    it('formats hash partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE orders (id INT PRIMARY KEY, customer NVARCHAR(100), created SECONDDATE) PARTITION BY HASH (id) PARTITIONS 4;'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE orders (
          id INT PRIMARY KEY,
          customer NVARCHAR(100),
          created SECONDDATE
        )
        PARTITION BY HASH (id) PARTITIONS 4;
      `);
    });

    it('formats round-robin partitioning', () => {
      expect(format('CREATE COLUMN TABLE t (a INT) PARTITION BY ROUNDROBIN PARTITIONS 4;'))
        .toBe(dedent`
          CREATE COLUMN TABLE t (a INT)
          PARTITION BY ROUNDROBIN PARTITIONS 4;
        `);
    });

    it('formats range partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT, b INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION VALUE = 10, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b INT)
        PARTITION BY RANGE (a) (
          PARTITION 1 <= VALUES < 10,
          PARTITION VALUE = 10,
          PARTITION OTHERS
        );
      `);
    });

    it('formats multi-level partitioning', () => {
      expect(
        format(
          'ALTER TABLE t PARTITION BY RANGE (a) (PARTITION 10 <= VALUES < 20) SUBPARTITION BY RANGE (b) (PARTITION 100 <= VALUES < 150);'
        )
      ).toBe(dedent`
        ALTER TABLE t
        PARTITION BY RANGE (a) (PARTITION 10 <= VALUES < 20)
        SUBPARTITION BY RANGE (b) (PARTITION 100 <= VALUES < 150);
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
  });

  describe('ALTER TABLE', () => {
    it('formats ALTER TABLE ... ADD / DROP / ALTER', () => {
      expect(
        format(dedent`
          ALTER TABLE t ADD (c INT, d NVARCHAR(5));
          ALTER TABLE t DROP (c);
          ALTER TABLE t ALTER (d NVARCHAR(10));
          ALTER TABLE t ADD CONSTRAINT pk PRIMARY KEY (a);
        `)
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c INT, d NVARCHAR(5));

        ALTER TABLE t
        DROP (c);

        ALTER TABLE t ALTER (d NVARCHAR(10));

        ALTER TABLE t
        ADD CONSTRAINT pk PRIMARY KEY (a);
      `);
    });

    it('formats RENAME statements', () => {
      expect(format('RENAME COLUMN t.a TO b;')).toBe('RENAME COLUMN t.a TO b;');
      expect(format('RENAME TABLE t TO u;')).toBe('RENAME TABLE t TO u;');
    });
  });

  describe('sequences', () => {
    it('formats CREATE SEQUENCE ... START WITH', () => {
      expect(
        format('CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 1000 NO CYCLE;')
      ).toBe('CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1 MAXVALUE 1000 NO CYCLE;');
    });

    it('formats ALTER SEQUENCE ... RESTART WITH', () => {
      expect(format('ALTER SEQUENCE seq RESTART WITH 100;')).toBe(
        'ALTER SEQUENCE seq RESTART WITH 100;'
      );
    });

    it('formats NEXTVAL and CURRVAL', () => {
      expect(format('SELECT seq.NEXTVAL, seq.CURRVAL FROM DUMMY;')).toBe(dedent`
        SELECT
          seq.NEXTVAL,
          seq.CURRVAL
        FROM
          DUMMY;
      `);
      expect(format("INSERT INTO t VALUES (seq.NEXTVAL, 'a');")).toBe(dedent`
        INSERT INTO
          t
        VALUES
          (seq.NEXTVAL, 'a');
      `);
    });
  });

  describe('WITH that is not a CTE', () => {
    it('does not treat WITH PRIMARY KEY, START WITH and WITH HINT as CTE', () => {
      expect(
        format(dedent`
          UPSERT t VALUES (1) WITH PRIMARY KEY;
          CREATE SEQUENCE s START WITH 1;
          SELECT * FROM t WITH HINT (NO_INLINE);
        `)
      ).toBe(dedent`
        UPSERT
          t
        VALUES
          (1)
        WITH PRIMARY KEY;

        CREATE SEQUENCE s START WITH 1;

        SELECT
          *
        FROM
          t
        WITH HINT (NO_INLINE);
      `);
    });

    it('does not treat other WITH options as CTE', () => {
      expect(
        format(dedent`
          CREATE VIEW v AS SELECT * FROM t WITH READ ONLY;
          GRANT SELECT ON SCHEMA s TO u WITH GRANT OPTION;
          SELECT * FROM UNNEST(:arr) WITH ORDINALITY AS t (a, n);
        `)
      ).toBe(dedent`
        CREATE VIEW v AS
        SELECT
          *
        FROM
          t WITH READ ONLY;

        GRANT SELECT ON SCHEMA s TO u WITH GRANT OPTION;

        SELECT
          *
        FROM
          UNNEST(:arr) WITH ORDINALITY AS t (a, n);
      `);
    });

    it('still formats CTEs named like WITH options', () => {
      expect(
        format(
          'WITH hint AS (SELECT 1 AS x FROM DUMMY), data AS (SELECT x FROM hint) SELECT * FROM data;'
        )
      ).toBe(dedent`
        WITH
          hint AS (
            SELECT
              1 AS x
            FROM
              DUMMY
          ),
          data AS (
            SELECT
              x
            FROM
              hint
          )
        SELECT
          *
        FROM
          data;
      `);
      expect(format('WITH data (a) AS (SELECT 1 FROM DUMMY) SELECT a FROM data;')).toBe(dedent`
        WITH
          data (a) AS (
            SELECT
              1
            FROM
              DUMMY
          )
        SELECT
          a
        FROM
          data;
      `);
    });
  });

  describe('MERGE INTO and COMMENT ON', () => {
    it('formats MERGE INTO with conditional WHEN MATCHED', () => {
      expect(
        format(
          'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED AND s.deleted = 1 THEN DELETE WHEN MATCHED THEN UPDATE SET t.name = s.name WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);'
        )
      ).toBe(dedent`
        MERGE INTO
          target t USING source s ON t.id = s.id
        WHEN MATCHED
          AND s.deleted = 1 THEN DELETE
        WHEN MATCHED THEN
        UPDATE SET
          t.name = s.name
        WHEN NOT MATCHED THEN
        INSERT
          (id, name)
        VALUES
          (s.id, s.name);
      `);
    });

    it('formats COMMENT ON', () => {
      expect(format("COMMENT ON VIEW v IS 'A view';")).toBe("COMMENT ON VIEW v IS 'A view';");
    });
  });

  describe('SQLScript', () => {
    it('formats CREATE PROCEDURE', () => {
      expect(
        format(
          'CREATE OR REPLACE PROCEDURE get_orders (IN p_customer INT, OUT o_orders TABLE (id INT, total DECIMAL(15, 2))) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS BEGIN o_orders = SELECT id, total FROM orders WHERE customer_id = :p_customer; END;'
        )
      ).toBe(dedent`
        CREATE OR REPLACE PROCEDURE get_orders (
          IN p_customer INT,
          OUT o_orders TABLE (id INT, total DECIMAL(15, 2))
        ) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
        BEGIN
          o_orders =
        SELECT
          id,
          total
        FROM
          orders
        WHERE
          customer_id = :p_customer;

        END;
      `);
    });

    it('formats CREATE FUNCTION', () => {
      expect(
        format(
          'CREATE FUNCTION add_one (a INT) RETURNS b INT LANGUAGE SQLSCRIPT AS BEGIN b := :a + 1; END;'
        )
      ).toBe(dedent`
        CREATE FUNCTION add_one (a INT) RETURNS b INT LANGUAGE SQLSCRIPT AS
        BEGIN
          b := :a + 1;

        END;
      `);
    });

    it('formats anonymous DO BEGIN ... END blocks', () => {
      expect(
        format('DO BEGIN DECLARE v_count INT := 0; SELECT COUNT(*) INTO v_count FROM orders; END;')
      ).toBe(dedent`
        DO BEGIN
        DECLARE v_count INT := 0;

        SELECT
          COUNT(*)
        INTO
          v_count
        FROM
          orders;

        END;
      `);
    });

    it('formats anonymous blocks with parameters', () => {
      expect(format('DO (IN p_limit INT => 10) BEGIN SELECT :p_limit FROM DUMMY; END;'))
        .toBe(dedent`
          DO (IN p_limit INT => 10)
          BEGIN
          SELECT
            :p_limit
          FROM
            DUMMY;

          END;
        `);
    });

    it('formats DECLARE statements', () => {
      expect(
        format(dedent`
          DECLARE v_name NVARCHAR(100) DEFAULT 'none';
          DECLARE arr INT ARRAY = ARRAY(1, 2, 3);
          DECLARE CURSOR c_orders FOR SELECT id FROM orders;
          DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_MESSAGE FROM DUMMY;
        `)
      ).toBe(dedent`
        DECLARE v_name NVARCHAR(100) DEFAULT 'none';

        DECLARE arr INT ARRAY = ARRAY(1, 2, 3);

        DECLARE CURSOR c_orders FOR
        SELECT
          id
        FROM
          orders;

        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        SELECT
          ::SQL_ERROR_MESSAGE
        FROM
          DUMMY;
      `);
    });

    it('formats IF ... THEN ... ELSEIF ... ELSE ... END IF', () => {
      expect(
        format(
          "IF :v_count > 0 THEN v_status := 'found'; ELSEIF :v_count = 0 THEN v_status := 'empty'; ELSE v_status := 'unknown'; END IF;"
        )
      ).toBe(dedent`
        IF :v_count > 0 THEN v_status := 'found';

        ELSEIF :v_count = 0 THEN v_status := 'empty';

        ELSE v_status := 'unknown';

        END IF;
      `);
    });

    it('formats WHILE ... DO loops', () => {
      expect(format('WHILE :i < 10 DO i := :i + 1; END WHILE;')).toBe(dedent`
        WHILE :i < 10 DO i := :i + 1;

        END WHILE;
      `);
      expect(format('WHILE :i < 10 DO BEGIN i := :i + 1; END; END WHILE;')).toBe(dedent`
        WHILE :i < 10 DO
        BEGIN
          i := :i + 1;

        END;

        END WHILE;
      `);
    });

    it('formats table variables', () => {
      expect(format('tv = SELECT id, name FROM customers WHERE id > :p_min; SELECT * FROM :tv;'))
        .toBe(dedent`
        tv =
        SELECT
          id,
          name
        FROM
          customers
        WHERE
          id > :p_min;

        SELECT
          *
        FROM
          :tv;
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL get_orders(p_customer => 42, o_orders => ?);')).toBe(
        'CALL get_orders (p_customer => 42, o_orders => ?);'
      );
      expect(format(`CALL "MY_SCHEMA"."pkg::proc"(p_in => :v, p_out => :tv);`)).toBe(
        `CALL "MY_SCHEMA"."pkg::proc" (p_in => :v, p_out => :tv);`
      );
    });

    it('formats SIGNAL and EXEC', () => {
      expect(format("SIGNAL SQL_ERROR_CODE 10001 SET MESSAGE_TEXT = 'Invalid input';")).toBe(
        "SIGNAL SQL_ERROR_CODE 10001 SET MESSAGE_TEXT = 'Invalid input';"
      );
      expect(format("EXEC 'SELECT * FROM ' || :tab;")).toBe("EXEC 'SELECT * FROM ' || :tab;");
    });
  });

  describe('GRANT and REVOKE', () => {
    it('does not treat privileges as clauses', () => {
      expect(
        format(dedent`
          GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA s TO u;
          REVOKE SELECT ON t FROM u;
        `)
      ).toBe(dedent`
        GRANT SELECT,
        INSERT,
        UPDATE,
        DELETE ON SCHEMA s TO u;

        REVOKE SELECT ON t FROM u;
      `);
    });
  });

  describe('case options on HANA vocabulary', () => {
    it('applies keywordCase, dataTypeCase and functionCase', () => {
      const sql = dedent`
        create column table t (a seconddate, b nvarchar(10), c alphanum(5), d st_geometry(4326), e smalldecimal) partition by hash (a) partitions 2;
        select top 3 add_days(a, 1), to_nvarchar(b), string_agg(c, ','), st_geomfromtext('POINT(1 1)'), current_utctimestamp, my_func(1) from t with hint (no_inline);
        upsert t values (1) with primary key;
      `;
      expect(format(sql, { keywordCase: 'upper', dataTypeCase: 'upper', functionCase: 'upper' }))
        .toBe(dedent`
        CREATE COLUMN TABLE t (
          a SECONDDATE,
          b NVARCHAR(10),
          c ALPHANUM(5),
          d ST_GEOMETRY(4326),
          e SMALLDECIMAL
        )
        PARTITION BY HASH (a) PARTITIONS 2;

        SELECT
          TOP 3 ADD_DAYS(a, 1),
          TO_NVARCHAR(b),
          STRING_AGG(c, ','),
          ST_GEOMFROMTEXT('POINT(1 1)'),
          CURRENT_UTCTIMESTAMP,
          my_func (1)
        FROM
          t
        WITH HINT (no_inline);

        UPSERT
          t
        VALUES
          (1)
        WITH PRIMARY KEY;
      `);
    });

    it('lowercases HANA data types and functions', () => {
      expect(
        format('SELECT CAST(a AS NVARCHAR(10)), TO_SECONDDATE(b), DAYS_BETWEEN(c, d) FROM t;', {
          dataTypeCase: 'lower',
          functionCase: 'lower',
        })
      ).toBe(dedent`
        SELECT
          cast(a AS nvarchar(10)),
          to_seconddate(b),
          days_between(c, d)
        FROM
          t;
      `);
    });
  });

  describe('idempotency', () => {
    const inputs = [
      'SELECT TOP 10 a, b FROM t WHERE c = ? AND d = :p ORDER BY a LIMIT 10 OFFSET 5',
      "UPSERT tbl (a, b) VALUES (1, N'x''y') WITH PRIMARY KEY; UPSERT tbl VALUES (1, X'00ab') WHERE a = 1;",
      'CREATE COLUMN TABLE #tmp (id INT PRIMARY KEY, name NVARCHAR(10), d SECONDDATE, g ST_GEOMETRY(4326)) PARTITION BY HASH (id) PARTITIONS 4, RANGE (d) (PARTITION 1 <= VALUES < 10, PARTITION OTHERS);',
      'CREATE SEQUENCE seq START WITH 1 INCREMENT BY 1; SELECT seq.NEXTVAL FROM DUMMY;',
      'SELECT * FROM t WITH HINT (NO_INLINE); WITH hint AS (SELECT 1 AS x FROM DUMMY) SELECT * FROM hint;',
      `SELECT * FROM "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$p$$', 'v')) -- comment
      WHERE /* block */ a = 1;`,
      "MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.a = s.a WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.a); COMMENT ON TABLE t IS 'x';",
      dedent`
        CREATE PROCEDURE p (IN p_id INT, OUT o_tab TABLE (id INT)) LANGUAGE SQLSCRIPT READS SQL DATA AS
        BEGIN
          DECLARE v_cnt INT := 0;
          DECLARE arr INT ARRAY = ARRAY(1, 2, 3);
          tv = SELECT id FROM customers WHERE id = :p_id;
          SELECT COUNT(*) INTO v_cnt FROM :tv;
          IF :v_cnt > 0 THEN
            o_tab = SELECT * FROM :tv;
          ELSEIF :v_cnt = 0 THEN
            v_cnt := :arr[2];
          ELSE
            SIGNAL SQL_ERROR_CODE 10001 SET MESSAGE_TEXT = 'none';
          END IF;
          FOR i IN 1..10 DO
            arr[:i] = :i;
          END FOR;
          WHILE :v_cnt < 10 DO
            v_cnt = :v_cnt + 1;
          END WHILE;
          CALL other_proc(a => :v_cnt, b => ?);
        END;
      `,
      'DO BEGIN DECLARE x INT = 1; SELECT :x, ::ROWCOUNT FROM DUMMY; END; DO (IN a INT => 5) BEGIN SELECT :a FROM DUMMY; END;',
    ];
    const configs = [
      {},
      { keywordCase: 'upper', dataTypeCase: 'lower', functionCase: 'upper' } as const,
      { indentStyle: 'tabularLeft' } as const,
      { indentStyle: 'tabularRight', denseOperators: true } as const,
      { useTabs: true, newlineBeforeSemicolon: true, expressionWidth: 20 } as const,
    ];
    const withoutWhitespace = (sql: string) => sql.replace(/\s+/g, '');

    inputs.forEach((input, i) => {
      it(`formats input #${i + 1} idempotently, changing only whitespace and case`, () => {
        configs.forEach(cfg => {
          const once = format(input, cfg);
          expect(format(once, cfg)).toBe(once);
          if (Object.keys(cfg).some(key => key.endsWith('Case'))) {
            expect(withoutWhitespace(once).toLowerCase()).toBe(
              withoutWhitespace(input).toLowerCase()
            );
          } else {
            expect(withoutWhitespace(once)).toBe(withoutWhitespace(input));
          }
        });
      });
    });
  });
});
