import fs from 'node:fs/promises';

function asBuffer(value) {
	if (value instanceof ArrayBuffer) return Buffer.from(value);
	if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	if (Buffer.isBuffer(value)) return value;
	return Buffer.from(String(value));
}

export class SqliteKvStore {
	constructor(database) {
		this.database = database;
		this.database.database.exec(`
			CREATE TABLE IF NOT EXISTS _server_kv (
				key TEXT PRIMARY KEY,
				value BLOB NOT NULL,
				metadata TEXT NOT NULL DEFAULT '{}',
				expires_at INTEGER
			)
		`);
	}

	cleanup(key) {
		const row = this.database.database.prepare('SELECT expires_at FROM _server_kv WHERE key = ?').get(key);
		if (row?.expires_at && row.expires_at <= Date.now()) {
			this.database.database.prepare('DELETE FROM _server_kv WHERE key = ?').run(key);
			return true;
		}
		return false;
	}

	async put(key, value, options = {}) {
		const expiresAt = options.expirationTtl ? Date.now() + Number(options.expirationTtl) * 1000 : null;
		const metadata = JSON.stringify(options.metadata || {});
		this.database.database.prepare(`
			INSERT INTO _server_kv(key, value, metadata, expires_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, metadata = excluded.metadata, expires_at = excluded.expires_at
		`).run(key, asBuffer(value), metadata, expiresAt);
	}

	async get(key, options = {}) {
		if (this.cleanup(key)) return null;
		const row = this.database.database.prepare('SELECT value FROM _server_kv WHERE key = ?').get(key);
		if (!row) return null;
		const value = Buffer.from(row.value);
		if (options.type === 'arrayBuffer') return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
		const text = value.toString('utf8');
		if (options.type === 'json') return JSON.parse(text);
		return text;
	}

	async getWithMetadata(key, options = {}) {
		if (this.cleanup(key)) return { value: null, metadata: null };
		const row = this.database.database.prepare('SELECT value, metadata FROM _server_kv WHERE key = ?').get(key);
		if (!row) return { value: null, metadata: null };
		const value = Buffer.from(row.value);
		return {
			value: options.type === 'arrayBuffer'
				? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
				: value.toString('utf8'),
			metadata: JSON.parse(row.metadata || '{}')
		};
	}

	async delete(key) {
		this.database.database.prepare('DELETE FROM _server_kv WHERE key = ?').run(key);
	}

	async list(options = {}) {
		const prefix = options.prefix || '';
		const rows = this.database.database.prepare('SELECT key FROM _server_kv WHERE key LIKE ? ORDER BY key').all(`${prefix}%`);
		return { keys: rows.filter(row => !this.cleanup(row.key)).map(row => ({ name: row.key })) };
	}
}

export async function ensureDataDirectory(databasePath) {
	await fs.mkdir(databasePath, { recursive: true });
}
