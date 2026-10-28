import { initialState, validateState } from '../store.js';

export class PostgresStore {
  constructor(pool, catalog, { schema = 'premio', defaults = {} } = {}) {
    if (!/^[a-z][a-z0-9_]{0,50}$/.test(schema)) throw new Error('Invalid database schema.');
    this.pool = pool;
    this.catalog = catalog;
    this.schema = `"${schema}"`;
    this.defaults = defaults;
  }

  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.state (
        id smallint PRIMARY KEY CHECK (id = 1), document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.sessions (
        token_hash char(64) PRIMARY KEY, csrf_token char(64) NOT NULL, expires bigint NOT NULL)`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.schema}.rate_limits (
        key_hash char(64) PRIMARY KEY, hits integer NOT NULL, until_ms bigint NOT NULL)`);
      const state = initialState(this.catalog, this.defaults);
      validateState(state);
      await client.query(`INSERT INTO ${this.schema}.state (id, document) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(state)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    await this.initialize();
  }

  async initialize() {
    const { rows } = await this.pool.query(`SELECT document FROM ${this.schema}.state WHERE id = 1`);
    if (rows.length !== 1) throw new Error('Database migration is required.');
    validateState(rows[0].document);
    this.state = rows[0].document;
  }

  async transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // A database row lock, not an instance-local queue, orders all invocations.
      const { rows } = await client.query(`SELECT document FROM ${this.schema}.state WHERE id = 1 FOR UPDATE`);
      if (rows.length !== 1) throw new Error('Application state is missing.');
      const original = rows[0].document;
      validateState(original);
      const draft = structuredClone(original);
      const result = await operation(draft);
      validateState(draft);
      if (JSON.stringify(draft) !== JSON.stringify(original)) {
        await client.query(`UPDATE ${this.schema}.state SET document = $1::jsonb, updated_at = now() WHERE id = 1`, [JSON.stringify(draft)]);
      }
      await client.query('COMMIT');
      this.state = draft;
      return structuredClone(result);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
