import { last } from '../utils.js';

const INDENT_TYPE_TOP_LEVEL = 'top-level';
const INDENT_TYPE_BLOCK_LEVEL = 'block-level';

/**
 * Manages indentation levels.
 *
 * There are two types of indentation levels:
 *
 * - BLOCK_LEVEL : increased by open-parenthesis
 * - TOP_LEVEL : increased by RESERVED_CLAUSE words
 *
 * Additionally there's the procedural block level,
 * increased by BLOCK_START keywords (like BEGIN).
 * Unlike the others, it's not confined to a single statement:
 * the statements inside BEGIN ... END are all indented by it.
 */
export default class Indentation {
  private indentTypes: string[] = [];

  /**
   * @param {string} indent A string to indent with
   * @param {number} procedureBlockLevel Initial procedural block level
   */
  constructor(private indent: string, private procedureBlockLevel = 0) {}

  /**
   * Returns indentation string for single indentation step.
   */
  getSingleIndent(): string {
    return this.indent;
  }

  /**
   * Returns current indentation level
   */
  getLevel(): number {
    return this.indentTypes.length + this.procedureBlockLevel;
  }

  /**
   * Returns current procedural block level
   */
  getProcedureBlockLevel(): number {
    return this.procedureBlockLevel;
  }

  /**
   * Increases the procedural block level by one.
   */
  increaseProcedureBlockLevel() {
    this.procedureBlockLevel++;
  }

  /**
   * Decreases the procedural block level by one (but never below zero).
   */
  decreaseProcedureBlockLevel() {
    this.procedureBlockLevel = Math.max(0, this.procedureBlockLevel - 1);
  }

  /**
   * Increases indentation by one top-level indent.
   */
  increaseTopLevel() {
    this.indentTypes.push(INDENT_TYPE_TOP_LEVEL);
  }

  /**
   * Increases indentation by one block-level indent.
   */
  increaseBlockLevel() {
    this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL);
  }

  /**
   * Decreases indentation by one top-level indent.
   * Does nothing when the previous indent is not top-level.
   */
  decreaseTopLevel() {
    if (this.indentTypes.length > 0 && last(this.indentTypes) === INDENT_TYPE_TOP_LEVEL) {
      this.indentTypes.pop();
    }
  }

  /**
   * Decreases indentation by one block-level indent.
   * If there are top-level indents within the block-level indent,
   * throws away these as well.
   */
  decreaseBlockLevel() {
    while (this.indentTypes.length > 0) {
      const type = this.indentTypes.pop();
      if (type !== INDENT_TYPE_TOP_LEVEL) {
        break;
      }
    }
  }
}
