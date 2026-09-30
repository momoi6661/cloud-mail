import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import app from '../../mail-worker/src/hono/webs.js';
import { loadConfig } from './config.js';
import { createD1Database } from './d1-compat.js';
import { SqliteKvStore } from './kv-store.js';
import { LocalObjectStore } from './object-store.js';
import { handleInboundEmail } from './email-webhook.js';
import { startSmtpServer } from './smtp-server.js';
import { ServerDomainStore } from './domain-store.js';

const MIME_TYPES = {
	'.css': 'text/css; charset=UTF-8',
	'.html': 'text/html; charset=UTF-8',
	'.js': 'text/javascript; charset=UTF-8',
	'.json': 'application/json; charset=UTF-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2'
};

async function staticResponse(c, staticDir) {
	const requestPath = decodeURIComponent(new URL(c.req.url).pathname);
	const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
	const candidate = path.resolve(staticDir, relative);
	const root = path.resolve(staticDir);
	let filePath = candidate.startsWith(`${root}${path.sep}`) ? candidate : path.join(root, 'index.html');

	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) throw new Error('not a file');
	} catch {
		filePath = path.join(root, 'index.html');
	}

	try {
		const body = await fs.readFile(filePath);
		return new Response(body, {
			headers: {
				'content-type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
				'cache-control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
			}
		});
	} catch (error) {
		if (error.code === 'ENOENT') return c.text('前端尚未构建，请先执行 pnpm --dir mail-vue build', 503);
		throw error;
	}
}

async function createEnv(config) {
	const db = await createD1Database(config.databasePath);
	const kv = new SqliteKvStore(db);
	const r2 = new LocalObjectStore(config.storagePath);
	const domainProvider = new ServerDomainStore(db, config.domains);
	await fs.mkdir(config.storagePath, { recursive: true });
	return {
		db,
		kv,
		r2,
		domain: domainProvider.domains,
		domainProvider,
		admin: config.admin,
		jwt_secret: config.jwtSecret,
		analysis_cache: config.analysisCache,
		orm_log: config.ormLog,
		project_link: config.projectLink,
		linuxdo_switch: config.linuxdoSwitch,
		linuxdo_client_id: config.linuxdoClientId,
		linuxdo_client_secret: config.linuxdoClientSecret,
		linuxdo_callback_url: config.linuxdoCallbackUrl,
		inboundEmailToken: config.inboundEmailToken
	};
}

export async function createServer() {
	const config = await loadConfig();
	const env = await createEnv(config);
	const serverApp = new Hono();

	serverApp.post('/internal/email', c => handleInboundEmail(c, env));
	serverApp.all('/api/*', async c => {
		const url = new URL(c.req.url);
		url.pathname = url.pathname.replace(/^\/api/, '') || '/';
		return app.fetch(new Request(url, c.req.raw), env);
	});
	serverApp.all('*', c => staticResponse(c, config.staticDir));

	return { config, env, app: serverApp };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const { config, env, app: serverApp } = await createServer();
	serve({
		fetch: serverApp.fetch,
		hostname: config.host,
		port: config.port
	});
	console.log(`Cloud Mail server listening on http://${config.host}:${config.port}`);
	console.log(`Configured domains: ${config.domains.join(', ')}`);
	if (config.smtpEnabled) {
		startSmtpServer({ config, env });
	}
}
