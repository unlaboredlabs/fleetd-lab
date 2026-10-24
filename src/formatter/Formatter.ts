import { FormatOptions } from '../FormatOptions.js';
import { indentString } from './config.js';
import Params from './Params.js';

import { createParser } from '../parser/createParser.js';
import { StatementNode } from '../parser/ast.js';
import { Dialect } from '../dialect.js';

import ExpressionFormatter from './ExpressionFormatter.js';
import Layout, { WS } from './Layout.js';
import Indentation from './Indentation.js';

/** Main formatter class that produces a final output string from list of tokens */
export default class Formatter {
  private dialect: Dialect;
  private cfg: FormatOptions;
  private params: Params;

  constructor(dialect: Dialect, cfg: FormatOptions) {
    this.dialect = dialect;
    this.cfg = cfg;
    this.params = new Params(this.cfg.params);
  }

  /**
   * Formats an SQL query.
   * @param {string} query - The SQL query string to be formatted
   * @return {string} The formatter query
   */
  public format(query: string): string {
    const ast = this.parse(query);
    const formattedQuery = this.formatAst(ast);
    return formattedQuery.trimEnd();
  }

  private parse(query: string): StatementNode[] {
    return createParser(this.dialect.tokenizer).parse(query, this.cfg.paramTypes || {});
  }

  private formatAst(statements: StatementNode[]): string {
    // Procedural block level (BEGIN ... END nesting) carried from one statement to the next
    let blockLevel = 0;
    let result = '';
    statements.forEach((stat, i) => {
      if (i > 0) {
        // Statements inside a procedural block are separated by a single newline
        result += '\n'.repeat(blockLevel > 0 ? 1 : this.cfg.linesBetweenQueries + 1);
      }
      const formatted = this.formatStatement(stat, blockLevel);
      result += formatted.text;
      blockLevel = formatted.blockLevel;
    });
    return result;
  }

  private formatStatement(
    statement: StatementNode,
    initialBlockLevel: number
  ): { text: string; blockLevel: number } {
    const layout = new Layout(new Indentation(indentString(this.cfg), initialBlockLevel));
    // Indent the first line of a statement inside a procedural block
    layout.add(WS.INDENT);
    new ExpressionFormatter({
      cfg: this.cfg,
      dialectCfg: this.dialect.formatOptions,
      params: this.params,
      layout,
    }).format(statement.children);

    const blockLevel = layout.indentation.getProcedureBlockLevel();
    if (!statement.hasSemicolon) {
      // do nothing
    } else if (this.cfg.newlineBeforeSemicolon) {
      layout.add(WS.NEWLINE, indentString(this.cfg).repeat(blockLevel) + ';');
    } else {
      layout.add(WS.NO_NEWLINE, ';');
    }
    return { text: layout.toString(), blockLevel };
  }
}
