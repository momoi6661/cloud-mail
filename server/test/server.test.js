import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createD1Database } from '../src/d1-compat.js';
import { SqliteKvStore } from '../src/kv-store.js';
import { LocalObjectStore } from '../src/object-store.js';
import { ServerDomainStore } from '../src/domain-store.js';

test('D1 and KV compatibility layers persist data', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-mail-server-'));
	const database = await createD1Database(path.join(root, 'mail.sqlite'));
	try {
		await database.prepare('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)').run();
		await database.prepare('INSERT INTO sample(value) VALUES (?)').bind('ok').run();
		const row = await database.prepare('SELECT value FROM sample WHERE id = ?').bind(1).first();
		assert.equal(row.value, 'ok');

		const kv = new SqliteKvStore(database);
		await kv.put('json', JSON.stringify({ ok: true }), { expirationTtl: 60 });
		assert.deepEqual(await kv.get('json', { type: 'json' }), { ok: true });
		assert.deepEqual((await kv.list({ prefix: 'j' })).keys, [{ name: 'json' }]);
	} finally {
		database.close();
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('local object storage returns Cloudflare R2-shaped objects', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-mail-objects-'));
	try {
		const storage = new LocalObjectStore(root);
		await storage.put('attachments/test.txt', Buffer.from('hello'), {
			httpMetadata: { contentType: 'text/plain' }
		});
		const object = await storage.get('attachments/test.txt');
		assert.equal(object.httpMetadata.contentType, 'text/plain');
		assert.equal(object.body.toString(), 'hello');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('server domains can be changed at runtime', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cloud-mail-domains-'));
	const database = await createD1Database(path.join(root, 'mail.sqlite'));
	try {
		const domains = new ServerDomainStore(database, ['example.com']);
		assert.deepEqual(await domains.get(), ['example.com']);
		assert.deepEqual(await domains.set(['@mail.example.com']), ['mail.example.com']);
	} finally {
		database.close();
		await fs.rm(root, { recursive: true, force: true });
	}
});
