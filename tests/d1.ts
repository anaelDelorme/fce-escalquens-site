// Port-free D1 test adapter: executes production SQL against Node's real SQLite engine.
// The API surface used here intentionally matches D1 (bind, first, all, run, batch).
import { DatabaseSync } from "node:sqlite";
export class TestDatabase {
  readonly db = new DatabaseSync(":memory:");
  constructor() {
    this.db.exec("PRAGMA foreign_keys=ON");
  }
  prepare(sql: string) {
    return new TestStatement(this, sql);
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
  async batch(statements: TestStatement[]) {
    this.db.exec("BEGIN");
    try {
      const result = statements.map((s) => s.execute());
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
class TestStatement {
  constructor(
    readonly owner: TestDatabase,
    readonly sql: string,
    readonly args: any[] = [],
  ) {}
  bind(...args: any[]) {
    return new TestStatement(this.owner, this.sql, args);
  }
  execute() {
    const statement = this.owner.db.prepare(this.sql);
    const results = statement.all(...this.args);
    const changes = this.owner.db.prepare("SELECT changes() AS n").get()!.n;
    return { success: true, results, meta: { changes: Number(changes) } };
  }
  async all<T = unknown>() {
    return this.execute() as any;
  }
  async first<T = unknown>(column?: string) {
    const row = this.owner.db.prepare(this.sql).get(...this.args);
    return (column ? row?.[column] : row || null) as T | null;
  }
  async run() {
    return this.execute();
  }
}
