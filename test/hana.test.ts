import dedent from 'dedent-js';

import { format as originalFormat, FormatFn } from '../src/sqlFormatter.js';
import { formatDialect, hana, supportedDialects } from '../src/index.js';
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
  supportsComments(format);
  supportsCommentOn(format);
  supportsCreateView(format, { orReplace: true });
  supportsCreateTable(format, { columnComment: true });
  supportsDropTable(format);
  supportsConstraints(format, ['RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']);
  supportsDeleteFrom(format);
  supportsInsertInto(format);
  supportsUpdate(format);
  supportsTruncateTable(format, { withTable: true });
  supportsMergeInto(format);
  supportsStrings(format, ["''-qq", "N''", "X''"]);
  supportsIdentifiers(format, [`""-qq`]);
  supportsBetween(format);
  supportsSchema(format);
  supportsOperators(format, [...standardOperators, '||', '=>'], { any: true });
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

  it('is selectable as a dialect', () => {
    expect(supportedDialects).toContain('hana');
    expect(formatDialect('select * from dummy', { dialect: hana })).toBe(
      format('select * from dummy')
    );
  });

  describe('lexical rules', () => {
    it('allows # and $ in identifiers, and # at the start of local temporary table names', () => {
      expect(format('SELECT col#1, a$b, my_col FROM #tmp, sch.#tmp2;')).toBe(dedent`
        SELECT
          col#1,
          a$b,
          my_col
        FROM
          #tmp,
          sch.#tmp2;
      `);
    });

    it('does not allow $ at the start of identifiers', () => {
      expect(() => format('SELECT $foo')).toThrowError('Parse error: Unexpected "$foo"');
    });

    it('treats backslash as an ordinary character in strings', () => {
      expect(format(`SELECT 'C:\\dir\\', 'a''b' FROM DUMMY;`)).toBe(dedent`
        SELECT
          'C:\\dir\\',
          'a''b'
        FROM
          DUMMY;
      `);
    });

    it('supports Unicode and binary string literals', () => {
      expect(format(`SELECT N'Grüße', n'x''y', X'0AFF', x'' FROM DUMMY;`)).toBe(dedent`
        SELECT
          N'Grüße',
          n'x''y',
          X'0AFF',
          x''
        FROM
          DUMMY;
      `);
    });

    it('supports double-quoted identifiers with doubled quotes', () => {
      expect(format('SELECT "Col ""A""" FROM "My Schema"."My Table";')).toBe(dedent`
        SELECT
          "Col ""A"""
        FROM
          "My Schema"."My Table";
      `);
    });

    it('keeps :name as a single token', () => {
      expect(format('SELECT * FROM :lt_tab WHERE id = :p_id AND x = :tab.col;')).toBe(dedent`
        SELECT
          *
        FROM
          :lt_tab
        WHERE
          id = :p_id
          AND x = :tab.col;
      `);
    });

    it('replaces :name parameters', () => {
      expect(format('SELECT :a, :b FROM DUMMY', { params: { a: '1', b: "'x'" } })).toBe(dedent`
        SELECT
          1,
          'x'
        FROM
          DUMMY
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

    it('supports || and => operators', () => {
      expect(format(`SELECT first_name||' '||last_name FROM t; CALL p(a=>1, b=>'x');`)).toBe(
        dedent`
        SELECT
          first_name || ' ' || last_name
        FROM
          t;

        CALL p (a => 1, b => 'x');
      `
      );
    });
  });

  describe('queries', () => {
    it('formats TOP', () => {
      expect(format('SELECT TOP 10 name FROM employees ORDER BY salary DESC;')).toBe(dedent`
        SELECT
          TOP 10 name
        FROM
          employees
        ORDER BY
          salary DESC;
      `);
    });

    it('formats LIMIT with OFFSET', () => {
      expect(format('SELECT * FROM t ORDER BY a LIMIT 10 OFFSET 20;')).toBe(dedent`
        SELECT
          *
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

    it('formats joins with cardinality', () => {
      expect(
        format(
          'SELECT * FROM a LEFT OUTER MANY TO ONE JOIN b ON a.id = b.id INNER EXACT ONE TO MANY JOIN c ON c.id = b.id;'
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          a
          LEFT OUTER MANY TO ONE JOIN b ON a.id = b.id
          INNER EXACT ONE TO MANY JOIN c ON c.id = b.id;
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

    it('formats query hints', () => {
      expect(format('SELECT * FROM t WHERE a = 1 WITH HINT (NO_CS_JOIN, USE_OLAP_PLAN);'))
        .toBe(dedent`
        SELECT
          *
        FROM
          t
        WHERE
          a = 1
        WITH HINT (NO_CS_JOIN, USE_OLAP_PLAN);
      `);
    });

    it('formats common table expressions named like a WITH phrase', () => {
      expect(
        format(
          'WITH hint AS (SELECT 1 AS x FROM DUMMY), data AS (SELECT 2 FROM DUMMY) SELECT * FROM hint, data;'
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
              2
            FROM
              DUMMY
          )
        SELECT
          *
        FROM
          hint,
          data;
      `);
    });

    it('formats calculation views with placeholders', () => {
      expect(
        format(
          `SELECT region, SUM(amount) FROM "_SYS_BIC"."sales/CV_SALES" (PLACEHOLDER."$$P_YEAR$$" => '2024') GROUP BY region;`
        )
      ).toBe(dedent`
        SELECT
          region,
          SUM(amount)
        FROM
          "_SYS_BIC"."sales/CV_SALES" (PLACEHOLDER."$$P_YEAR$$" => '2024')
        GROUP BY
          region;
      `);
      expect(
        format(
          `SELECT * FROM "_SYS_BIC"."sales/CV_SALES" ('PLACEHOLDER' = ('$$P_YEAR$$', '2024'));`
        )
      ).toBe(dedent`
        SELECT
          *
        FROM
          "_SYS_BIC"."sales/CV_SALES" ('PLACEHOLDER' = ('$$P_YEAR$$', '2024'));
      `);
      expect(format(`SELECT * FROM cv WITH PARAMETERS ('PLACEHOLDER' = ('$$IP$$', '1'));`))
        .toBe(dedent`
        SELECT
          *
        FROM
          cv WITH PARAMETERS ('PLACEHOLDER' = ('$$IP$$', '1'));
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

    it('formats a range of numbers', () => {
      expect(format('SELECT 42, -35.04, 105., 2.53E+3, .456 FROM DUMMY;')).toBe(dedent`
        SELECT
          42,
          -35.04,
          105.,
          2.53E+3,
          .456
        FROM
          DUMMY;
      `);
    });
  });

  describe('data manipulation', () => {
    it('formats UPSERT ... WITH PRIMARY KEY', () => {
      expect(format("UPSERT employees (id, name) VALUES (1, N'Ann') WITH PRIMARY KEY;"))
        .toBe(dedent`
        UPSERT
          employees (id, name)
        VALUES
          (1, N'Ann')
        WITH PRIMARY KEY;
      `);
    });

    it('formats UPSERT ... WHERE', () => {
      expect(format("UPSERT employees VALUES (1, 'Ann') WHERE id = 1;")).toBe(dedent`
        UPSERT
          employees
        VALUES
          (1, 'Ann')
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

    it('formats REPLACE statement like UPSERT, but REPLACE() as a function', () => {
      expect(
        format("REPLACE t VALUES (1, 'x') WITH PRIMARY KEY; SELECT REPLACE(a, 'x', 'y') FROM t;")
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

    it('formats DELETE HISTORY', () => {
      expect(format('DELETE HISTORY FROM t WHERE id = 5;')).toBe(dedent`
        DELETE HISTORY FROM t
        WHERE
          id = 5;
      `);
    });
  });

  describe('data definition', () => {
    it('formats CREATE COLUMN | ROW | TEMPORARY TABLE', () => {
      expect(
        format(`
          CREATE COLUMN TABLE a (id INT PRIMARY KEY);
          CREATE ROW TABLE b (id INT);
          CREATE LOCAL TEMPORARY TABLE #c (id INT);
          CREATE LOCAL TEMPORARY COLUMN TABLE #d (id INT);
          CREATE GLOBAL TEMPORARY TABLE e (id INT);
          CREATE GLOBAL TEMPORARY ROW TABLE f (id INT);
        `)
      ).toBe(dedent`
        CREATE COLUMN TABLE a (id INT PRIMARY KEY);

        CREATE ROW TABLE b (id INT);

        CREATE LOCAL TEMPORARY TABLE #c (id INT);

        CREATE LOCAL TEMPORARY COLUMN TABLE #d (id INT);

        CREATE GLOBAL TEMPORARY TABLE e (id INT);

        CREATE GLOBAL TEMPORARY ROW TABLE f (id INT);
      `);
    });

    it('formats CREATE TABLE with HANA data types', () => {
      expect(
        format(
          'CREATE COLUMN TABLE t (id BIGINT GENERATED BY DEFAULT AS IDENTITY, code ALPHANUM(10), name NVARCHAR(100) NOT NULL, created SECONDDATE, price SMALLDECIMAL, doc NCLOB, shape ST_GEOMETRY(4326), descr SHORTTEXT(200) FUZZY SEARCH INDEX ON);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE t (
          id BIGINT GENERATED BY DEFAULT AS IDENTITY,
          code ALPHANUM(10),
          name NVARCHAR(100) NOT NULL,
          created SECONDDATE,
          price SMALLDECIMAL,
          doc NCLOB,
          shape ST_GEOMETRY(4326),
          descr SHORTTEXT(200) FUZZY SEARCH INDEX ON
        );
      `);
    });

    it('formats range partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE sales (id INT, yr INT) PARTITION BY RANGE (yr) (PARTITION 2020 <= VALUES < 2022, PARTITION VALUE = 2022, PARTITION OTHERS);'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE sales (id INT, yr INT)
        PARTITION BY
          RANGE (yr) (
            PARTITION 2020 <= VALUES < 2022,
            PARTITION VALUE = 2022,
            PARTITION OTHERS
          );
      `);
    });

    it('formats hash and round-robin partitioning', () => {
      expect(
        format(
          'CREATE COLUMN TABLE h (id INT) PARTITION BY HASH (id) PARTITIONS 4; CREATE COLUMN TABLE r (id INT) PARTITION BY ROUNDROBIN PARTITIONS 2;'
        )
      ).toBe(dedent`
        CREATE COLUMN TABLE h (id INT)
        PARTITION BY
          HASH (id) PARTITIONS 4;

        CREATE COLUMN TABLE r (id INT)
        PARTITION BY
          ROUNDROBIN PARTITIONS 2;
      `);
    });

    it('formats CREATE TABLE AS ... WITH NO DATA', () => {
      expect(format('CREATE TABLE t2 AS (SELECT * FROM t) WITH NO DATA;')).toBe(dedent`
        CREATE TABLE t2 AS (
          SELECT
            *
          FROM
            t
        ) WITH NO DATA;
      `);
    });

    it('formats sequences', () => {
      expect(
        format(
          'CREATE SEQUENCE seq START WITH 100 INCREMENT BY 10 MAXVALUE 1000 NO CYCLE; ALTER SEQUENCE seq RESTART WITH 1;'
        )
      ).toBe(dedent`
        CREATE SEQUENCE seq START WITH 100 INCREMENT BY 10 MAXVALUE 1000 NO CYCLE;

        ALTER SEQUENCE seq RESTART WITH 1;
      `);
    });

    it('formats ALTER TABLE', () => {
      expect(
        format(`
          ALTER TABLE t ADD (c INT, d NVARCHAR(5));
          ALTER TABLE t ALTER (d NVARCHAR(50));
          ALTER TABLE t DROP (c);
          RENAME TABLE t TO t2;
          RENAME COLUMN t2.d TO e;
        `)
      ).toBe(dedent`
        ALTER TABLE t
        ADD (c INT, d NVARCHAR(5));

        ALTER TABLE t
        ALTER (d NVARCHAR(50));

        ALTER TABLE t
        DROP (c);

        RENAME TABLE t TO t2;

        RENAME COLUMN t2.d TO e;
      `);
    });

    it('formats GRANT', () => {
      expect(format('GRANT SELECT ON SCHEMA s TO u WITH GRANT OPTION;')).toBe(dedent`
        GRANT SELECT ON SCHEMA s TO u WITH GRANT OPTION;
      `);
    });

    it('does not treat privileges of GRANT and REVOKE as clauses', () => {
      expect(format('GRANT SELECT, INSERT, UPDATE ON t TO u; REVOKE DELETE ON t FROM u;')).toBe(
        dedent`
        GRANT SELECT,
        INSERT,
        UPDATE ON t TO u;

        REVOKE DELETE ON t FROM u;
      `
      );
    });

    it('formats IMPORT and EXPORT', () => {
      expect(
        format(
          `IMPORT FROM CSV FILE '/data/t.csv' INTO t WITH RECORD DELIMITED BY '\n' THREADS 4; EXPORT t AS CSV INTO '/tmp/t';`
        )
      ).toBe(dedent`
        IMPORT FROM CSV FILE '/data/t.csv' INTO t WITH RECORD DELIMITED BY '\n' THREADS 4;

        EXPORT t AS CSV INTO '/tmp/t';
      `);
    });

    it('formats CREATE VIEW ... WITH CHECK OPTION', () => {
      expect(format('CREATE VIEW v AS SELECT a FROM t WHERE a > 0 WITH CHECK OPTION;')).toBe(dedent`
        CREATE VIEW v AS
        SELECT
          a
        FROM
          t
        WHERE
          a > 0 WITH CHECK OPTION;
      `);
    });
  });

  describe('SQLScript', () => {
    it('formats CREATE PROCEDURE', () => {
      expect(
        format(`
          CREATE PROCEDURE get_orders (IN p_id INT, OUT o_tab TABLE (id INT, amount DECIMAL(10,2)))
          LANGUAGE SQLSCRIPT READS SQL DATA AS
          BEGIN
            DECLARE v_count INT = 0;
            o_tab = SELECT id, amount FROM orders WHERE customer_id = :p_id;
            SELECT COUNT(*) INTO v_count FROM :o_tab;
          END;
        `)
      ).toBe(dedent`
        CREATE PROCEDURE get_orders (
          IN p_id INT,
          OUT o_tab TABLE (id INT, amount DECIMAL(10, 2))
        ) LANGUAGE SQLSCRIPT READS SQL DATA AS BEGIN
          DECLARE v_count INT = 0;
          o_tab =
          SELECT
            id,
            amount
          FROM
            orders
          WHERE
            customer_id = :p_id;
          SELECT
            COUNT(*)
          INTO
            v_count
          FROM
            :o_tab;
        END;
      `);
    });

    it('formats anonymous DO BEGIN ... END block', () => {
      expect(format('DO BEGIN SELECT 1 FROM DUMMY; END; SELECT 2 FROM DUMMY;')).toBe(dedent`
        DO BEGIN
          SELECT
            1
          FROM
            DUMMY;
        END;

        SELECT
          2
        FROM
          DUMMY;
      `);
    });

    it('formats DO block with parameters', () => {
      expect(
        format(
          'DO (IN a INT => 5, OUT b TABLE (x INT) => ?) BEGIN b = SELECT :a AS x FROM DUMMY; END;'
        )
      ).toBe(dedent`
        DO (IN a INT => 5, OUT b TABLE (x INT) => ?) BEGIN
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
          `DO BEGIN DECLARE x INT = 1; IF :x > 10 THEN x = 10; ELSEIF :x < 0 THEN x = 0; ELSE x = CASE WHEN :x = 1 THEN 2 ELSE 3 END; END IF; END;`
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE x INT = 1;
          IF :x > 10 THEN
            x = 10;
          ELSEIF :x < 0 THEN
            x = 0;
          ELSE
            x = CASE
              WHEN :x = 1 THEN 2
              ELSE 3
            END;
          END IF;
        END;
      `);
    });

    it('formats nested blocks', () => {
      expect(
        format(
          `CREATE PROCEDURE p (IN x INT) AS BEGIN IF :x > 0 THEN IF :x > 10 THEN SELECT 'big' FROM DUMMY; END IF; ELSE BEGIN SELECT 'neg' FROM DUMMY; END; END IF; END;`
        )
      ).toBe(dedent`
        CREATE PROCEDURE p (IN x INT) AS BEGIN
          IF :x > 0 THEN
            IF :x > 10 THEN
              SELECT
                'big'
              FROM
                DUMMY;
            END IF;
          ELSE
            BEGIN
              SELECT
                'neg'
              FROM
                DUMMY;
            END;
          END IF;
        END;
      `);
    });

    it('formats loops', () => {
      expect(
        format(
          `DO BEGIN DECLARE i INT := 0; WHILE :i < 3 DO i = :i + 1; END WHILE; FOR j IN 1..10 DO CALL log_it(msg => :j); END FOR; FOR k IN REVERSE 1 .. :i DO CONTINUE; END FOR; FOR r AS cur DO i = r.a; END FOR; LOOP IF :i > 5 THEN BREAK; END IF; i = :i + 1; END LOOP; END;`
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE i INT := 0;
          WHILE :i < 3 DO
            i = :i + 1;
          END WHILE;
          FOR j IN 1..10 DO
            CALL log_it (msg => :j);
          END FOR;
          FOR k IN REVERSE 1..:i DO
            CONTINUE;
          END FOR;
          FOR r AS cur DO
            i = r.a;
          END FOR;
          LOOP
            IF :i > 5 THEN
              BREAK;
            END IF;
            i = :i + 1;
          END LOOP;
        END;
      `);
    });

    it('formats DECLARE statements, cursors, arrays and table variables', () => {
      expect(
        format(
          `DO BEGIN DECLARE CURSOR c FOR SELECT a FROM t; DECLARE lv INT; DECLARE arr INT ARRAY = ARRAY(1, 2, 3); DECLARE lt TABLE (a INT); OPEN c; FETCH c INTO lv; CLOSE c; arr[2] = :arr[1]; lt = SELECT * FROM :lt WHERE a > CARDINALITY(:arr); END;`
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE CURSOR c FOR
          SELECT
            a
          FROM
            t;
          DECLARE lv INT;
          DECLARE arr INT ARRAY = ARRAY(1, 2, 3);
          DECLARE lt TABLE (a INT);
          OPEN c;
          FETCH c
          INTO
            lv;
          CLOSE c;
          arr[2] = :arr[1];
          lt =
          SELECT
            *
          FROM
            :lt
          WHERE
            a > CARDINALITY(:arr);
        END;
      `);
    });

    it('formats exit handlers and signals', () => {
      expect(
        format(
          `DO BEGIN DECLARE my_cond CONDITION FOR SQL_ERROR_CODE 10001; DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SELECT ::SQL_ERROR_MESSAGE FROM DUMMY; END; SIGNAL my_cond SET MESSAGE_TEXT = 'oops'; END;`
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE my_cond CONDITION FOR SQL_ERROR_CODE 10001;
          DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
            SELECT
              ::SQL_ERROR_MESSAGE
            FROM
              DUMMY;
          END;
          SIGNAL my_cond SET MESSAGE_TEXT = 'oops';
        END;
      `);
    });

    it('formats REPEAT ... UNTIL ... END REPEAT', () => {
      expect(format('DO BEGIN DECLARE i INT = 0; REPEAT i = :i + 1; UNTIL :i > 5 END REPEAT; END;'))
        .toBe(dedent`
        DO BEGIN
          DECLARE i INT = 0;
          REPEAT
            i = :i + 1;
          UNTIL :i > 5 END REPEAT;
        END;
      `);
    });

    it('formats autonomous transaction and parallel execution blocks', () => {
      expect(
        format(
          'DO BEGIN BEGIN AUTONOMOUS TRANSACTION INSERT INTO log VALUES (1); COMMIT; END; BEGIN PARALLEL EXECUTION CALL p1(); CALL p2(); END; END;'
        )
      ).toBe(dedent`
        DO BEGIN
          BEGIN AUTONOMOUS TRANSACTION
            INSERT INTO
              log
            VALUES
              (1);
            COMMIT;
          END;
          BEGIN PARALLEL EXECUTION
            CALL p1 ();
            CALL p2 ();
          END;
        END;
      `);
    });

    it('formats CREATE FUNCTION', () => {
      expect(
        format(
          `CREATE FUNCTION f (p INT) RETURNS TABLE (a INT) LANGUAGE SQLSCRIPT AS BEGIN RETURN SELECT a FROM t WHERE a = :p; END;`
        )
      ).toBe(dedent`
        CREATE FUNCTION f (p INT) RETURNS TABLE (a INT) LANGUAGE SQLSCRIPT AS BEGIN
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

    it('formats CREATE TRIGGER', () => {
      expect(
        format(
          `CREATE TRIGGER trg AFTER INSERT OR UPDATE ON t REFERENCING NEW ROW nr FOR EACH ROW BEGIN INSERT INTO log VALUES (:nr.id); END;`
        )
      ).toBe(dedent`
        CREATE TRIGGER trg AFTER INSERT OR UPDATE ON t REFERENCING NEW ROW nr FOR EACH ROW BEGIN
          INSERT INTO
            log
          VALUES
            (:nr.id);
        END;
      `);
    });

    it('formats CALL with named arguments', () => {
      expect(format('CALL my_proc(p_in => 1, p_out => ?) WITH OVERVIEW;')).toBe(dedent`
        CALL my_proc (p_in => 1, p_out => ?) WITH OVERVIEW;
      `);
    });

    it('keeps comments inside blocks', () => {
      expect(
        format(dedent`
          DO BEGIN
            -- first
            SELECT 1 FROM DUMMY; -- trailing
            /* block */
            x = 1;
          END;
        `)
      ).toBe(dedent`
        DO BEGIN
          -- first
          SELECT
            1
          FROM
            DUMMY;
          -- trailing
          /* block */
          x = 1;
        END;
      `);
    });

    it('indents semicolons inside blocks with newlineBeforeSemicolon', () => {
      expect(format('DO BEGIN x = 1; END;', { newlineBeforeSemicolon: true })).toBe(dedent`
        DO BEGIN
          x = 1
          ;
        END
        ;
      `);
    });

    it('uses linesBetweenQueries only outside of blocks', () => {
      expect(format('DO BEGIN x = 1; y = 2; END; SELECT 1 FROM DUMMY;', { linesBetweenQueries: 2 }))
        .toBe(dedent`
        DO BEGIN
          x = 1;
          y = 2;
        END;


        SELECT
          1
        FROM
          DUMMY;
      `);
    });

    it('does not treat reserved words as block keywords when used as aliases', () => {
      expect(format('SELECT a AS end, b AS begin FROM t; SELECT 1 FROM DUMMY;')).toBe(dedent`
        SELECT
          a AS end,
          b AS begin
        FROM
          t;

        SELECT
          1
        FROM
          DUMMY;
      `);
    });
  });

  describe('case options', () => {
    it('changes case of HANA keywords', () => {
      expect(
        format(
          'upsert t values (1) with primary key; select top 1 * from dummy with hint (no_cs_join);',
          {
            keywordCase: 'upper',
          }
        )
      ).toBe(dedent`
        UPSERT
          t
        VALUES
          (1)
        WITH PRIMARY KEY;

        SELECT
          TOP 1 *
        FROM
          dummy
        WITH HINT (no_cs_join);
      `);
    });

    it('changes case of SQLScript keywords', () => {
      expect(
        format(
          'do begin declare x int; if :x > 1 then x = 1; elseif :x < 0 then x = 0; else x = 2; end if; end;',
          {
            keywordCase: 'upper',
            dataTypeCase: 'upper',
          }
        )
      ).toBe(dedent`
        DO BEGIN
          DECLARE x INT;
          IF :x > 1 THEN
            x = 1;
          ELSEIF :x < 0 THEN
            x = 0;
          ELSE
            x = 2;
          END IF;
        END;
      `);
    });

    it('changes case of HANA data types', () => {
      expect(
        format(
          'CREATE TABLE t (a seconddate, b nvarchar(10), c alphanum(5), d st_geometry, e smalldecimal, f shorttext(10))',
          { dataTypeCase: 'upper' }
        )
      ).toBe(dedent`
        CREATE TABLE t (
          a SECONDDATE,
          b NVARCHAR(10),
          c ALPHANUM(5),
          d ST_GEOMETRY,
          e SMALLDECIMAL,
          f SHORTTEXT(10)
        )
      `);
      expect(format('SELECT CAST(a AS NVARCHAR(10)) FROM t', { dataTypeCase: 'lower' })).toBe(
        dedent`
        SELECT
          CAST(a AS nvarchar(10))
        FROM
          t
      `
      );
    });

    it('changes case of HANA functions and formats them as function calls', () => {
      expect(
        format(
          "SELECT add_days(d, 1), to_nvarchar(d, 'YYYY'), string_agg(n, ','), days_between(a, b), ifnull(x, 0), current_date FROM t",
          { functionCase: 'upper', keywordCase: 'upper' }
        )
      ).toBe(dedent`
        SELECT
          ADD_DAYS(d, 1),
          TO_NVARCHAR(d, 'YYYY'),
          STRING_AGG(n, ','),
          DAYS_BETWEEN(a, b),
          IFNULL(x, 0),
          CURRENT_DATE
        FROM
          t
      `);
    });
  });

  describe('idempotency', () => {
    const queries = [
      `CREATE PROCEDURE p (IN a INT, OUT b TABLE (x INT)) LANGUAGE SQLSCRIPT AS BEGIN DECLARE i INT = 0; -- loop
       WHILE :i < :a DO i = :i + 1; END WHILE; b = SELECT :i AS x FROM DUMMY; END;`,
      `DO BEGIN IF 1 = 1 THEN /* yes */ SELECT 1 FROM DUMMY; ELSE SELECT 2 FROM DUMMY; END IF; END;`,
      `UPSERT t (a) VALUES (1) WITH PRIMARY KEY; SELECT s.NEXTVAL FROM DUMMY WITH HINT (NO_CS_JOIN);`,
      `CREATE COLUMN TABLE p (a INT) PARTITION BY RANGE (a) (PARTITION 1 <= VALUES < 10, PARTITION OTHERS);`,
      `FOR i IN 1..10 DO x = :arr[:i] || 'x'; END FOR;`,
    ];
    const configs = [
      {},
      { keywordCase: 'lower' as const, dataTypeCase: 'lower' as const },
      { indentStyle: 'tabularLeft' as const },
      { indentStyle: 'tabularRight' as const },
      { denseOperators: true, newlineBeforeSemicolon: true },
      { useTabs: true, expressionWidth: 10 },
    ];
    configs.forEach(cfg => {
      it(`formatting the output again changes nothing with ${JSON.stringify(cfg)}`, () => {
        queries.forEach(query => {
          const once = format(query, cfg);
          expect(format(once, cfg)).toBe(once);
          // only whitespace and case changes
          expect(once.replace(/\s+/g, '').toLowerCase()).toBe(
            query.replace(/\s+/g, '').toLowerCase()
          );
        });
      });
    });
  });
});
