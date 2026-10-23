import dedent from 'dedent-js';

import { format as originalFormat, FormatFn } from '../src/sqlFormatter.js';
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
  supportsConstraints(format, ['RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
  supportsDeleteFrom(format);
  supportsInsertInto(format);
  supportsUpdate(format, { whereCurrentOf: true });
  supportsTruncateTable(format);
  supportsMergeInto(format);
  supportsStrings(format, ["''-qq", "N''", "X''"]);
  supportsIdentifiers(format, [`""-qq`]);
  supportsBetween(format);
  supportsSchema(format);
  supportsOperators(format, [...standardOperators, '||', '=>', ':=', '..'], { any: true });
  supportsJoin(format, {
    without: ['NATURAL'],
    additionally: [
      'LEFT OUTER MANY TO ONE JOIN',
      'INNER MANY TO MANY JOIN',
      'LEFT EXACT ONE TO EXACT ONE JOIN',
      'RIGHT OUTER ONE TO MANY JOIN',
      'MANY TO ONE JOIN',
    ],
    supportsUsing: false,
  });
  supportsSetOperations(format, [
    'UNION',
    'UNION ALL',
    'UNION DISTINCT',
    'EXCEPT',
    'EXCEPT DISTINCT',
    'INTERSECT',
    'INTERSECT DISTINCT',
    'MINUS',
  ]);
  supportsParams(format, { positional: true, named: [':'] });
  supportsLimiting(format, { limit: true, offset: true });
  supportsDataTypeCase(format);

  describe('lexical rules', () => {
    it('supports # and $ in identifiers, and # at the start of local temporary table names', () => {
      expect(format('SELECT col#1, price$, #tmp.id FROM #tmp, my$tbl#;')).toBe(dedent`
        SELECT
          col#1,
          price$,
          #tmp.id
        FROM
          #tmp,
          my$tbl#;
      `);
    });

    it('does not treat backslash as escape character in strings', () => {
      expect(format(`SELECT 'C:\\' || 'dir' FROM DUMMY;`)).toBe(dedent`
        SELECT
          'C:\\' || 'dir'
        FROM
          DUMMY;
      `);
    });

    it('supports N and X prefixed strings', () => {
      expect(format(`SELECT N'Grüße', X'00ABCD', x'dcba00' FROM DUMMY;`)).toBe(dedent`
        SELECT
          N'Grüße',
          X'00ABCD',
          x'dcba00'
        FROM
          DUMMY;
      `);
    });

    it('keeps :name SQLScript variable reference as a single token', () => {
      expect(format('SELECT * FROM :lt_orders WHERE id = :p_id AND name=:p_name;')).toBe(dedent`
        SELECT
          *
        FROM
          :lt_orders
        WHERE
          id = :p_id
          AND name = :p_name;
      `);
    });

    it('supports :name table variable with column and array element access', () => {
      expect(format('x = :lt.col[1] + :arr[:i];')).toBe('x = :lt.col[1] + :arr[:i];');
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

    it('supports named arguments', () => {
      expect(format('CALL my_proc(in_id=>1, out_tab=>?);')).toBe(dedent`
        CALL my_proc (in_id => 1, out_tab => ?);
      `);
    });

    it('formats range operator of FOR loop, even without spaces around it', () => {
      expect(format('FOR i IN 1..10 DO x := :x + 1; END FOR;')).toBe(dedent`
        FOR i IN 1 .. 10 DO
          x := :x + 1;
        END FOR;
      `);
      expect(format('FOR i IN 1.. 10 DO END FOR; FOR i IN :a..:b DO END FOR;')).toBe(dedent`
        FOR i IN 1 .. 10 DO
        END FOR;

        FOR i IN :a .. :b DO
        END FOR;
      `);
    });

    it('does not treat NATURAL JOIN as a join', () => {
      expect(format('SELECT * FROM a NATURAL JOIN b;')).toBe(dedent`
        SELECT
          *
        FROM
          a NATURAL
          JOIN b;
      `);
    });
  });

  describe('vocabulary', () => {
    it('changes case of HANA data types with dataTypeCase', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a secondDate, b nvarchar(10), c alphanum(5), d st_geometry(4326), e smalldecimal, f shorttext(20), g bintext, h tinyint);',
          { dataTypeCase: 'upper' }
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (
          a SECONDDATE,
          b NVARCHAR(10),
          c ALPHANUM(5),
          d ST_GEOMETRY(4326),
          e SMALLDECIMAL,
          f SHORTTEXT(20),
          g BINTEXT,
          h TINYINT
        );
      `);
    });

    it('changes case of HANA built-in functions with functionCase', () => {
      expect(
        format(
          "SELECT add_days(d, 1), to_nvarchar(d, 'YYYY'), string_agg(n, ','), ifnull(a, 0), days_between(a, b), hierarchy_descendants(x) FROM t;",
          { functionCase: 'upper' }
        )
      ).toBe(dedent`
        SELECT
          ADD_DAYS(d, 1),
          TO_NVARCHAR(d, 'YYYY'),
          STRING_AGG(n, ','),
          IFNULL(a, 0),
          DAYS_BETWEEN(a, b),
          HIERARCHY_DESCENDANTS(x)
        FROM
          t;
      `);
    });

    it('formats built-in function calls as function calls', () => {
      expect(format("SELECT ADD_MONTHS (d, 1), SUBSTR_AFTER (s, '-') FROM t;")).toBe(dedent`
        SELECT
          ADD_MONTHS(d, 1),
          SUBSTR_AFTER(s, '-')
        FROM
          t;
      `);
    });

    it('changes case of HANA keywords with keywordCase', () => {
      expect(
        format(
          'upsert t values (1) with primary key; select top 5 current_date, current_utctimestamp, sysuuid from dummy;',
          { keywordCase: 'upper' }
        )
      ).toBe(dedent`
        UPSERT
          t
        VALUES
          (1)
        WITH PRIMARY KEY;

        SELECT
          TOP 5 CURRENT_DATE,
          CURRENT_UTCTIMESTAMP,
          SYSUUID
        FROM
          dummy;
      `);
    });

    it('treats keyword-like functions called without parenthesis as keywords', () => {
      expect(
        format(
          'create procedure p language sqlscript as begin select current_schema from dummy; end;',
          {
            keywordCase: 'upper',
            functionCase: 'lower',
          }
        )
      ).toBe(dedent`
        CREATE PROCEDURE p LANGUAGE SQLSCRIPT AS
        BEGIN
          SELECT
            CURRENT_SCHEMA
          FROM
            dummy;
        END;
      `);
    });

    it('formats clause keywords inside function arguments on a single line', () => {
      expect(
        format(
          "SELECT EXTRACT(YEAR FROM d), TRIM(LEADING '0' FROM s), STRING_AGG(name, ', ' ORDER BY name) FROM t;"
        )
      ).toBe(dedent`
        SELECT
          EXTRACT(YEAR FROM d),
          TRIM(LEADING '0' FROM s),
          STRING_AGG(name, ', ' ORDER BY name)
        FROM
          t;
      `);
    });

    it('formats REPLACE function', () => {
      expect(format("SELECT REPLACE(name, 'a', 'b') FROM t;")).toBe(dedent`
        SELECT
          REPLACE(name, 'a', 'b')
        FROM
          t;
      `);
    });
  });

  describe('queries', () => {
    it('formats SELECT TOP', () => {
      expect(format('SELECT TOP 10 a, b FROM t ORDER BY a;')).toBe(dedent`
        SELECT
          TOP 10 a,
          b
        FROM
          t
        ORDER BY
          a;
      `);
    });

    it('formats query hints', () => {
      expect(format('SELECT * FROM t WHERE a = 1 WITH HINT (NO_CS_JOIN, ROUTE_TO(1));'))
        .toBe(dedent`
        SELECT
          *
        FROM
          t
        WHERE
          a = 1
        WITH HINT (NO_CS_JOIN, ROUTE_TO (1));
      `);
    });

    it('formats FOR UPDATE and time travel', () => {
      expect(
        format(
          "SELECT * FROM t FOR UPDATE NOWAIT; SELECT * FROM t AS OF UTCTIMESTAMP '2024-01-01';"
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          t
        FOR UPDATE NOWAIT;

        SELECT
          *
        FROM
          t AS OF UTCTIMESTAMP '2024-01-01';
      `);
    });

    it('formats SELECT INTO', () => {
      expect(format('SELECT a, b INTO x, y DEFAULT 0, 0 FROM t WHERE id = :id;')).toBe(dedent`
        SELECT
          a,
          b
        INTO
          x,
          y DEFAULT 0,
          0
        FROM
          t
        WHERE
          id = :id;
      `);
    });

    it('formats sequence values selected from DUMMY', () => {
      expect(format('SELECT my_seq.NEXTVAL, my_seq.CURRVAL FROM DUMMY;')).toBe(dedent`
        SELECT
          my_seq.NEXTVAL,
          my_seq.CURRVAL
        FROM
          DUMMY;
      `);
    });

    it('formats calculation view with placeholders', () => {
      expect(
        format(
          `SELECT region, SUM(amount) FROM "_SYS_BIC"."sales/CV_SALES" (PLACEHOLDER."$$IP_YEAR$$" => '2024', PLACEHOLDER."$$IP_REGION$$" => 'EMEA') GROUP BY region;`
        )
      ).toBe(dedent`
        SELECT
          region,
          SUM(amount)
        FROM
          "_SYS_BIC"."sales/CV_SALES" (
            PLACEHOLDER."$$IP_YEAR$$" => '2024',
            PLACEHOLDER."$$IP_REGION$$" => 'EMEA'
          )
        GROUP BY
          region;
      `);
    });

    it('formats calculation view with old-style placeholder syntax', () => {
      expect(
        format(
          `SELECT * FROM "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$IP_YEAR$$', '2024')); SELECT * FROM "_SYS_BIC"."pkg/CV" WITH PARAMETERS ('PLACEHOLDER' = ('$$IP_YEAR$$', '2024'));`
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV" ('PLACEHOLDER' = ('$$IP_YEAR$$', '2024'));

        SELECT
          *
        FROM
          "_SYS_BIC"."pkg/CV" WITH PARAMETERS ('PLACEHOLDER' = ('$$IP_YEAR$$', '2024'));
      `);
    });

    it('formats CASE JOIN', () => {
      expect(
        format(
          "SELECT a FROM t1 LEFT OUTER MANY TO ONE CASE JOIN WHEN t1.k = 'A' THEN RETURN b FROM t2 ON t1.id = t2.id END;"
        )
      ).toBe(dedent`
        SELECT
          a
        FROM
          t1
          LEFT OUTER MANY TO ONE CASE JOIN WHEN t1.k = 'A' THEN RETURN b FROM t2 ON t1.id = t2.id END;
      `);
    });
  });

  describe('WITH that is not a common table expression', () => {
    it('formats CTE', () => {
      expect(format('WITH cte (a) AS (SELECT 1 FROM DUMMY) SELECT a FROM cte;')).toBe(dedent`
        WITH
          cte (a) AS (
            SELECT
              1
            FROM
              DUMMY
          )
        SELECT
          a
        FROM
          cte;
      `);
    });

    it('formats WITH PRIMARY KEY', () => {
      expect(format("UPSERT employees (id, name) VALUES (1, 'Jane') WITH PRIMARY KEY;"))
        .toBe(dedent`
        UPSERT
          employees (id, name)
        VALUES
          (1, 'Jane')
        WITH PRIMARY KEY;
      `);
    });

    it('formats START WITH and RESTART WITH', () => {
      expect(
        format(
          'CREATE SEQUENCE my_seq START WITH 100 INCREMENT BY 10 MAXVALUE 1000 NO CYCLE; ALTER SEQUENCE my_seq RESTART WITH 1;'
        )
      ).toBe(dedent`
        CREATE SEQUENCE my_seq START WITH 100 INCREMENT BY 10 MAXVALUE 1000 NO CYCLE;

        ALTER SEQUENCE my_seq RESTART WITH 1;
      `);
    });

    it('formats other WITH options', () => {
      expect(
        format(
          'CREATE VIEW v AS SELECT * FROM t WITH READ ONLY; GRANT SELECT ON t TO u WITH GRANT OPTION;'
        )
      ).toBe(dedent`
        CREATE VIEW v AS
        SELECT
          *
        FROM
          t WITH READ ONLY;

        GRANT SELECT ON t TO u WITH GRANT OPTION;
      `);
    });
  });

  describe('data manipulation', () => {
    it('formats UPSERT with WHERE', () => {
      expect(format("UPSERT employees VALUES (1, 'Jane') WHERE id = 1;")).toBe(dedent`
        UPSERT
          employees
        VALUES
          (1, 'Jane')
        WHERE
          id = 1;
      `);
    });

    it('formats UPSERT with subquery', () => {
      expect(format('UPSERT employees SELECT * FROM new_employees;')).toBe(dedent`
        UPSERT
          employees
        SELECT
          *
        FROM
          new_employees;
      `);
    });

    it('formats REPLACE statement', () => {
      expect(format("REPLACE employees (id, name) VALUES (1, 'Jane') WITH PRIMARY KEY;"))
        .toBe(dedent`
        REPLACE
          employees (id, name)
        VALUES
          (1, 'Jane')
        WITH PRIMARY KEY;
      `);
    });

    it('formats MERGE INTO with conditions', () => {
      expect(
        format(
          'MERGE INTO target t USING source s ON t.id = s.id WHEN MATCHED AND s.deleted = 1 THEN DELETE WHEN NOT MATCHED THEN INSERT VALUES (s.id, s.val);'
        )
      ).toBe(dedent`
        MERGE INTO
          target t USING source s ON t.id = s.id
        WHEN MATCHED
          AND s.deleted = 1 THEN DELETE
        WHEN NOT MATCHED THEN
        INSERT
        VALUES
          (s.id, s.val);
      `);
    });

    it('formats DELETE HISTORY', () => {
      expect(format('DELETE HISTORY FROM t WHERE id = 1;')).toBe(dedent`
        DELETE HISTORY FROM t
        WHERE
          id = 1;
      `);
    });
  });

  describe('data definition', () => {
    [
      'COLUMN',
      'ROW',
      'HISTORY COLUMN',
      'VIRTUAL',
      'GLOBAL TEMPORARY',
      'LOCAL TEMPORARY COLUMN',
    ].forEach(tableType => {
      it(`formats CREATE ${tableType} TABLE`, () => {
        expect(format(`CREATE ${tableType} TABLE t (id INT PRIMARY KEY, name NVARCHAR(100));`))
          .toBe(dedent`
            CREATE ${tableType} TABLE t (id INT PRIMARY KEY, name NVARCHAR(100));
          `);
      });
    });

    it('formats CREATE LOCAL TEMPORARY TABLE with # name', () => {
      expect(format('CREATE LOCAL TEMPORARY TABLE #tmp (id INT); DROP TABLE #tmp;')).toBe(dedent`
        CREATE LOCAL TEMPORARY TABLE #tmp (id INT);

        DROP TABLE #tmp;
      `);
    });

    it('formats CREATE TABLE with hash partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE sales (id INT PRIMARY KEY, region NVARCHAR(20), amount DECIMAL(15, 2)) PARTITION BY HASH (id) PARTITIONS 4;'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE sales (
          id INT PRIMARY KEY,
          region NVARCHAR(20),
          amount DECIMAL(15, 2)
        )
        PARTITION BY
          HASH (id) PARTITIONS 4;
      `);
    });

    it('formats CREATE TABLE with range partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (a INT, b DATE) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 100, PARTITION 100 <= VALUES < 200, PARTITION VALUE = 500, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (a INT, b DATE)
        PARTITION BY
          RANGE (a) (
            PARTITION 1 <= VALUES < 100,
            PARTITION 100 <= VALUES < 200,
            PARTITION VALUE = 500,
            PARTITION OTHERS
          );
      `);
    });

    it('formats ALTER TABLE', () => {
      expect(
        format(
          'ALTER TABLE t ADD (c INT, d NVARCHAR(10)); ALTER TABLE t ALTER (c BIGINT); ALTER TABLE t DROP (c);'
        )
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c INT, d NVARCHAR(10));

        ALTER TABLE t
        ALTER (c BIGINT);

        ALTER TABLE t
        DROP (c);
      `);
    });

    it('formats RENAME statements', () => {
      expect(format('RENAME TABLE a TO b; RENAME COLUMN t.a TO b;')).toBe(dedent`
        RENAME TABLE a TO b;

        RENAME COLUMN t.a TO b;
      `);
    });

    it('formats CREATE TRIGGER', () => {
      expect(
        format(
          'CREATE TRIGGER trg AFTER INSERT OR UPDATE OF price OR DELETE ON products REFERENCING NEW ROW AS new_row FOR EACH ROW BEGIN INSERT INTO log VALUES (:new_row.id); END;'
        )
      ).toBe(dedent`
        CREATE TRIGGER trg AFTER INSERT OR UPDATE OF price OR DELETE ON products REFERENCING NEW ROW AS new_row FOR EACH ROW
        BEGIN
          INSERT INTO
            log
          VALUES
            (:new_row.id);
        END;
      `);
    });
  });

  describe('SQLScript', () => {
    it('formats CREATE PROCEDURE', () => {
      expect(
        format(`
          CREATE OR REPLACE PROCEDURE get_orders (IN p_customer INT, OUT ot_orders TABLE (id INT, amount DECIMAL(15, 2)))
          LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
          BEGIN
            DECLARE lv_count INT := 0;
            lt_orders = SELECT id, amount FROM orders WHERE customer_id = :p_customer;
            SELECT COUNT(*) INTO lv_count FROM :lt_orders;
            IF :lv_count > 0 THEN
              ot_orders = SELECT * FROM :lt_orders;
            ELSE
              ot_orders = SELECT NULL AS id, 0 AS amount FROM DUMMY;
            END IF;
          END;
        `)
      ).toBe(dedent`
        CREATE OR REPLACE PROCEDURE get_orders (
          IN p_customer INT,
          OUT ot_orders TABLE (id INT, amount DECIMAL(15, 2))
        ) LANGUAGE SQLSCRIPT SQL SECURITY INVOKER READS SQL DATA AS
        BEGIN
          DECLARE lv_count INT := 0;
          lt_orders =
          SELECT
            id,
            amount
          FROM
            orders
          WHERE
            customer_id = :p_customer;
          SELECT
            COUNT(*)
          INTO
            lv_count
          FROM
            :lt_orders;
          IF :lv_count > 0 THEN
            ot_orders =
            SELECT
              *
            FROM
              :lt_orders;
          ELSE
            ot_orders =
            SELECT
              NULL AS id,
              0 AS amount
            FROM
              DUMMY;
          END IF;
        END;
      `);
    });

    it('formats CREATE FUNCTION', () => {
      expect(
        format(
          'CREATE FUNCTION double_it (a INT) RETURNS b INT LANGUAGE SQLSCRIPT AS BEGIN b := :a * 2; END;'
        )
      ).toBe(dedent`
        CREATE FUNCTION double_it (a INT) RETURNS b INT LANGUAGE SQLSCRIPT AS
        BEGIN
          b := :a * 2;
        END;
      `);
    });

    it('formats anonymous block', () => {
      expect(
        format(
          'DO BEGIN DECLARE i INTEGER; CREATE ROW TABLE tab1 (i INTEGER); FOR i IN 1..10 DO INSERT INTO tab1 VALUES (:i); END FOR; END;'
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE i INTEGER;
          CREATE ROW TABLE tab1 (i INTEGER);
          FOR i IN 1 .. 10 DO
            INSERT INTO
              tab1
            VALUES
              (:i);
          END FOR;
        END;
      `);
    });

    it('formats anonymous block with parameters', () => {
      expect(
        format(
          'DO (IN a INT => 5, OUT b TABLE (x INT) => ?) BEGIN b = SELECT :a AS x FROM DUMMY; END;'
        )
      ).toBe(dedent`
        DO (IN a INT => 5, OUT b TABLE (x INT) => ?)
        BEGIN
          b =
          SELECT
            :a AS x
          FROM
            DUMMY;
        END;
      `);
    });

    it('formats IF ... ELSEIF ... ELSE ... END IF', () => {
      expect(
        format(
          "IF :a > 0 THEN x := 'pos'; ELSEIF :a < 0 THEN x := 'neg'; IF :a < -10 THEN y := 1; END IF; ELSE x := CASE WHEN :b = 1 THEN 'one' ELSE 'zero' END; END IF;"
        )
      ).toBe(dedent`
        IF :a > 0 THEN
          x := 'pos';
        ELSEIF :a < 0 THEN
          x := 'neg';
          IF :a < -10 THEN
            y := 1;
          END IF;
        ELSE
          x := CASE
            WHEN :b = 1 THEN 'one'
            ELSE 'zero'
          END;
        END IF;
      `);
    });

    it('formats WHILE and LOOP', () => {
      expect(
        format(
          'DO BEGIN WHILE :i < 10 DO i := :i + 1; IF :i = 5 THEN BREAK; END IF; END WHILE; LOOP i := :i - 1; IF :i = 0 THEN BREAK; END IF; CONTINUE; END LOOP; END;'
        )
      ).toBe(dedent`
        DO BEGIN
          WHILE :i < 10 DO
            i := :i + 1;
            IF :i = 5 THEN
              BREAK;
            END IF;
          END WHILE;
          LOOP
            i := :i - 1;
            IF :i = 0 THEN
              BREAK;
            END IF;
            CONTINUE;
          END LOOP;
        END;
      `);
    });

    it('formats cursors', () => {
      expect(
        format(
          'DO BEGIN DECLARE CURSOR c_items (p INT) FOR SELECT id FROM items WHERE grp = :p; FOR r AS c_items(1) DO x := :x + r.id; END FOR; OPEN c_items(2); FETCH c_items INTO y; CLOSE c_items; END;'
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE CURSOR c_items (p INT) FOR
          SELECT
            id
          FROM
            items
          WHERE
            grp = :p;
          FOR r AS c_items (1) DO
            x := :x + r.id;
          END FOR;
          OPEN c_items (2);
          FETCH c_items INTO y;
          CLOSE c_items;
        END;
      `);
    });

    it('formats table variables and arrays', () => {
      expect(
        format(
          "DO BEGIN DECLARE lt TABLE (id INT, name NVARCHAR(10)); DECLARE arr INT ARRAY = ARRAY(1, 2, 3); arr[4] := CARDINALITY(:arr); :lt.INSERT((1, 'a')); lt2 = UNNEST(:arr) AS (val); SELECT * FROM :lt, :lt2; END;"
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE lt TABLE (id INT, name NVARCHAR(10));
          DECLARE arr INT ARRAY = ARRAY(1, 2, 3);
          arr[4] := CARDINALITY(:arr);
          :lt.INSERT ((1, 'a'));
          lt2 = UNNEST(:arr) AS (val);
          SELECT
            *
          FROM
            :lt,
            :lt2;
        END;
      `);
    });

    it('formats exception handlers', () => {
      expect(
        format(`
          DO BEGIN
            DECLARE my_error CONDITION FOR SQL_ERROR_CODE 10001;
            DECLARE EXIT HANDLER FOR SQLEXCEPTION
            IF ::SQL_ERROR_CODE = 288 THEN DROP TABLE tab; ELSE RESIGNAL; END IF;
            DECLARE CONTINUE HANDLER FOR my_error BEGIN SELECT ::SQL_ERROR_MESSAGE FROM DUMMY; END;
            SIGNAL my_error SET MESSAGE_TEXT = 'Something went wrong';
          END;
        `)
      ).toBe(dedent`
        DO BEGIN
          DECLARE my_error CONDITION FOR SQL_ERROR_CODE 10001;
          DECLARE EXIT HANDLER FOR SQLEXCEPTION IF ::SQL_ERROR_CODE = 288 THEN
            DROP TABLE tab;
          ELSE
            RESIGNAL;
          END IF;
          DECLARE CONTINUE HANDLER FOR my_error
          BEGIN
            SELECT
              ::SQL_ERROR_MESSAGE
            FROM
              DUMMY;
          END;
          SIGNAL my_error SET MESSAGE_TEXT = 'Something went wrong';
        END;
      `);
    });

    it('formats block properties', () => {
      expect(
        format(
          'DO BEGIN SEQUENTIAL EXECUTION BEGIN PARALLEL EXECUTION INSERT INTO a VALUES (1); END; BEGIN AUTONOMOUS TRANSACTION INSERT INTO log VALUES (2); END; END;'
        )
      ).toBe(dedent`
        DO BEGIN SEQUENTIAL EXECUTION
          BEGIN PARALLEL EXECUTION
            INSERT INTO
              a
            VALUES
              (1);
          END;
          BEGIN AUTONOMOUS TRANSACTION
            INSERT INTO
              log
            VALUES
              (2);
          END;
        END;
      `);
    });

    it('formats dynamic SQL', () => {
      expect(
        format(
          "DO BEGIN EXEC 'SELECT COUNT(*) FROM t' INTO cnt; EXECUTE IMMEDIATE 'DROP TABLE t'; END;"
        )
      ).toBe(dedent`
        DO BEGIN
          EXEC 'SELECT COUNT(*) FROM t' INTO cnt;
          EXECUTE IMMEDIATE 'DROP TABLE t';
        END;
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL schema1.my_proc(in_id => :id, out_tab => lt_out) WITH OVERVIEW;'))
        .toBe(dedent`
        CALL schema1.my_proc (in_id => :id, out_tab => lt_out) WITH OVERVIEW;
      `);
    });

    it('formats empty blocks', () => {
      expect(format('DO BEGIN END; CREATE PROCEDURE p AS BEGIN END;')).toBe(dedent`
        DO BEGIN
        END;

        CREATE PROCEDURE p AS
        BEGIN
        END;
      `);
    });

    it('formats comments inside blocks', () => {
      expect(
        format(`
          DO BEGIN
            -- first
            x := 1; /* second */
            IF :x > 0 THEN -- positive
              y := 2;
            END IF;
            -- last
          END;
        `)
      ).toBe(dedent`
        DO BEGIN
          -- first
          x := 1;
          /* second */
          IF :x > 0 THEN -- positive
            y := 2;
          END IF;
          -- last
        END;
      `);
    });

    it('formats last statement of a block without semicolon', () => {
      expect(format('DO BEGIN x := 1; y := 2 END')).toBe(dedent`
        DO BEGIN
          x := 1;
          y := 2
        END
      `);
    });

    it('formats blocks with keywordCase', () => {
      expect(
        format('do begin if :a = 1 then x := 1; else x := 2; end if; end;', {
          keywordCase: 'upper',
        })
      ).toBe(dedent`
        DO BEGIN
          IF :a = 1 THEN
            x := 1;
          ELSE
            x := 2;
          END IF;
        END;
      `);
    });

    it('formats blocks with newlineBeforeSemicolon', () => {
      expect(format('DO BEGIN x := 1; END;', { newlineBeforeSemicolon: true })).toBe(dedent`
        DO BEGIN
          x := 1
          ;
        END
        ;
      `);
    });

    it('formats blocks in tabular style', () => {
      expect(format('DO BEGIN SELECT a FROM t WHERE b = 1; END;', { indentStyle: 'tabularLeft' }))
        .toBe(dedent`
        DO BEGIN
                  SELECT    a
                  FROM      t
                  WHERE     b = 1;
        END;
      `);
    });

    it('formats incomplete block like separate statements', () => {
      expect(format('BEGIN SELECT 1 FROM DUMMY;')).toBe(dedent`
        BEGIN
        SELECT
          1
        FROM
          DUMMY;
      `);
    });

    it('recognizes blocks containing method calls on parenthesized expressions', () => {
      expect(
        format('DO BEGIN x = NEW ST_POINT(1, 2).ST_AsText(); IF :a = 1 THEN y = 2; END IF; END;')
      ).toBe(dedent`
        DO BEGIN
          x = NEW ST_POINT(1, 2).ST_AsText ();
          IF :a = 1 THEN
            y = 2;
          END IF;
        END;
      `);
    });

    it('does not treat words after a dot as block keywords', () => {
      expect(format('SELECT t.begin, t.end, t.if FROM t;')).toBe(dedent`
        SELECT
          t.begin,
          t.end,
          t.if
        FROM
          t;
      `);
    });
  });

  describe('formatting is idempotent and changes only whitespace', () => {
    const sql = dedent`
      CREATE PROCEDURE p (IN a INT, OUT b NVARCHAR(10)) LANGUAGE SQLSCRIPT AS
      BEGIN
        DECLARE x SECONDDATE;
        DECLARE EXIT HANDLER FOR SQLEXCEPTION SELECT ::SQL_ERROR_MESSAGE FROM DUMMY;
        IF :a > 0 THEN
          SELECT ADD_DAYS(CURRENT_DATE, 1), TO_NVARCHAR(:a) INTO x, b FROM DUMMY WHERE a = 1 AND b = 2;
        ELSEIF :a < 0 THEN
          FOR i IN 1..:a DO b := :b || 'x'; END FOR;
        ELSE
          WHILE :a < 10 DO a := :a + 1; END WHILE;
        END IF;
        UPSERT t VALUES (1, 'a') WITH PRIMARY KEY;
        SELECT * FROM t WITH HINT (NO_CS_JOIN);
      END;
    `;

    [
      {},
      { keywordCase: 'upper' as const },
      { keywordCase: 'lower' as const },
      { indentStyle: 'tabularLeft' as const },
      { indentStyle: 'tabularRight' as const },
      { newlineBeforeSemicolon: true },
      { denseOperators: true },
      { useTabs: true },
    ].forEach(cfg => {
      it(`with ${JSON.stringify(cfg)}`, () => {
        const result = format(sql, cfg);
        expect(format(result, cfg)).toBe(result);
        expect(result.replace(/\s+/g, '').toUpperCase()).toBe(
          sql.replace(/\s+/g, '').toUpperCase()
        );
      });
    });
  });
});
