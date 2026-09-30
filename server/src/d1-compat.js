import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function normalizeParams(params) {
	return params.map(value => {
		if (value instanceof ArrayBuffer) return Buffer.from(value);
		if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		return value;
	});
}

class PreparedStatement {
	constructor(database, sql) {
		this.database = database;
		this.sql = sql;
		this.params = [];
	}

	bind(...params) {
		this.params = normalizeParams(params);
		return this;
	}

	statement() {
		return this.database.prepare(this.sql);
	}

	async run() {
		const result = this.statement().run(...this.params);
		return {
			success: true,
			meta: {
				changes: Number(result.changes),
				last_row_id: Number(result.lastInsertRowid)
			}
		};
	}

	async first(columnName) {
		const row = this.statement().get(...this.params);
		if (columnName) return row?.[columnName] ?? null;
		return row ?? null;
	}

	async all() {
		return {
			success: true,
			results: this.statement().all(...this.params),
			meta: {}
		};
	}

	async raw() {
		const statement = this.statement();
		const rows = statement.all(...this.params);
		const columns = statement.columns().map(column => column.name);
		return rows.map(row => columns.map(column => row[column]));
	}

	async executeForBatch() {
		const normalizedSql = this.sql.trim().toLowerCase();
		if (normalizedSql.startsWith('select') || normalizedSql.startsWith('pragma') || normalizedSql.startsWith('with')) {
			return this.all();
		}
		return this.run();
	}
}

export class D1CompatDatabase {
	constructor(databasePath) {
		this.databasePath = databasePath;
		this.database = new DatabaseSync(databasePath);
		this.database.exec('PRAGMA foreign_keys = ON;');
	}

	prepare(sql) {
		return new PreparedStatement(this.database, sql);
	}

	async batch(statements) {
		this.database.exec('BEGIN');
		try {
			const results = [];
			for (const statement of statements) {
				results.push(await statement.executeForBatch());
			}
			this.database.exec('COMMIT');
			return results;
		} catch (error) {
			this.database.exec('ROLLBACK');
			throw error;
		}
	}

	close() {
		this.database.close();
	}
}

export async function createD1Database(databasePath) {
	await fs.mkdir(path.dirname(databasePath), { recursive: true });
	return new D1CompatDatabase(databasePath);
}
