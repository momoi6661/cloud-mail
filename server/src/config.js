import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseBoolean(value, fallback) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'boolean') return value;
	return String(value).toLowerCase() === 'true';
}

function parseDomains(value, fallback) {
	if (value === undefined || value === null || value === '') return fallback;
	if (Array.isArray(value)) return value;
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		// Comma-separated environment variables are also supported.
	}
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function resolvePath(value, fallback) {
	const selected = value || fallback;
	return path.isAbsolute(selected) ? selected : path.resolve(SERVER_ROOT, selected);
}

async function readJsonIfPresent(filePath) {
	try {
		return JSON.parse(await fs.readFile(filePath, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return {};
		throw new Error(`无法读取服务器配置 ${filePath}: ${error.message}`);
	}
}

export async function loadConfig() {
	const configPath = process.env.MAIL_CONFIG
		? resolvePath(process.env.MAIL_CONFIG, './config.local.json')
		: path.join(SERVER_ROOT, 'config.local.json');
	const fileConfig = {
		...(await readJsonIfPresent(path.join(SERVER_ROOT, 'config.example.json'))),
		...(await readJsonIfPresent(configPath))
	};

	const domains = parseDomains(process.env.MAIL_DOMAINS ?? fileConfig.domains, []);
	if (domains.length === 0) {
		throw new Error('未配置邮箱域名，请编辑 server/config.local.json 的 domains，或设置 MAIL_DOMAINS');
	}

	const config = {
		host: process.env.MAIL_HOST || fileConfig.host || '127.0.0.1',
		port: Number(process.env.MAIL_PORT || fileConfig.port || 8787),
		smtpHost: process.env.MAIL_SMTP_HOST || fileConfig.smtpHost || '0.0.0.0',
		smtpPort: Number(process.env.MAIL_SMTP_PORT || fileConfig.smtpPort || 2525),
		smtpEnabled: parseBoolean(process.env.MAIL_SMTP_ENABLED, parseBoolean(fileConfig.smtpEnabled, true)),
		smtpName: process.env.MAIL_SMTP_NAME || fileConfig.smtpName || 'cloud-mail',
		smtpBanner: process.env.MAIL_SMTP_BANNER || fileConfig.smtpBanner || 'Cloud Mail SMTP',
		domains,
		admin: process.env.MAIL_ADMIN || fileConfig.admin || '',
		jwtSecret: process.env.MAIL_JWT_SECRET || fileConfig.jwtSecret || '',
		databasePath: resolvePath(process.env.MAIL_DB_PATH || fileConfig.databasePath, './data/cloud-mail.sqlite'),
		storagePath: resolvePath(process.env.MAIL_STORAGE_PATH || fileConfig.storagePath, './data/objects'),
		staticDir: resolvePath(process.env.MAIL_STATIC_DIR || fileConfig.staticDir, '../mail-worker/dist'),
		inboundEmailToken: process.env.MAIL_INBOUND_TOKEN || fileConfig.inboundEmailToken || '',
		analysisCache: parseBoolean(process.env.MAIL_ANALYSIS_CACHE, parseBoolean(fileConfig.analysisCache, false)),
		ormLog: parseBoolean(process.env.MAIL_ORM_LOG, parseBoolean(fileConfig.ormLog, false)),
		projectLink: parseBoolean(process.env.MAIL_PROJECT_LINK, parseBoolean(fileConfig.projectLink, true)),
		linuxdoSwitch: parseBoolean(process.env.MAIL_LINUXDO_SWITCH, parseBoolean(fileConfig.linuxdoSwitch, false)),
		linuxdoClientId: process.env.MAIL_LINUXDO_CLIENT_ID || fileConfig.linuxdoClientId || '',
		linuxdoClientSecret: process.env.MAIL_LINUXDO_CLIENT_SECRET || fileConfig.linuxdoClientSecret || '',
		linuxdoCallbackUrl: process.env.MAIL_LINUXDO_CALLBACK_URL || fileConfig.linuxdoCallbackUrl || ''
	};

	if (!config.jwtSecret || config.jwtSecret === 'change-this-before-starting' || config.jwtSecret === 'replace-with-a-long-random-secret') {
		throw new Error('请先在 server/config.local.json 中设置 jwtSecret');
	}

	return config;
}

export { SERVER_ROOT };
