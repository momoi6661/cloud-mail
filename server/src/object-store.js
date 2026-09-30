import fs from 'node:fs/promises';
import path from 'node:path';

function toBuffer(content) {
	if (Buffer.isBuffer(content)) return content;
	if (content instanceof ArrayBuffer) return Buffer.from(content);
	if (ArrayBuffer.isView(content)) return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
	return Buffer.from(String(content));
}

export class LocalObjectStore {
	constructor(root) {
		this.root = path.resolve(root);
	}

	filePath(key) {
		const target = path.resolve(this.root, ...String(key).split('/'));
		if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
			throw new Error('非法对象路径');
		}
		return target;
	}

	metadataPath(key) {
		return `${this.filePath(key)}.meta.json`;
	}

	async put(key, content, options = {}) {
		const target = this.filePath(key);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, toBuffer(content));
		await fs.writeFile(this.metadataPath(key), JSON.stringify(options.httpMetadata || {}));
	}

	async get(key) {
		try {
			const [body, metadata] = await Promise.all([
				fs.readFile(this.filePath(key)),
				fs.readFile(this.metadataPath(key), 'utf8').catch(() => '{}')
			]);
			return { body, httpMetadata: JSON.parse(metadata) };
		} catch (error) {
			if (error.code === 'ENOENT') return null;
			throw error;
		}
	}

	async delete(key) {
		await Promise.all([
			fs.rm(this.filePath(key), { force: true }),
			fs.rm(this.metadataPath(key), { force: true })
		]);
	}
}
