const DOMAIN_PATTERN = /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

function normalizeDomains(domains) {
	if (!Array.isArray(domains)) {
		throw new Error('邮箱域名必须是数组');
	}
	const normalized = [...new Set(domains
		.map(domain => String(domain).trim().replace(/^@/, '').toLowerCase())
		.filter(Boolean))];
	if (normalized.length === 0 || normalized.some(domain => !DOMAIN_PATTERN.test(domain))) {
		throw new Error('邮箱域名格式不正确');
	}
	return normalized;
}

export class ServerDomainStore {
	constructor(database, initialDomains) {
		this.database = database;
		this.database.database.exec(`
			CREATE TABLE IF NOT EXISTS _server_domains (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				domains TEXT NOT NULL
			)
		`);
		const row = this.database.database.prepare('SELECT domains FROM _server_domains WHERE id = 1').get();
		this.domains = row ? normalizeDomains(JSON.parse(row.domains)) : normalizeDomains(initialDomains);
		if (!row) {
			this.database.database.prepare('INSERT INTO _server_domains(id, domains) VALUES (1, ?)').run(JSON.stringify(this.domains));
		}
	}

	async get() {
		return [...this.domains];
	}

	async set(domains) {
		const normalized = normalizeDomains(domains);
		this.database.database.prepare('UPDATE _server_domains SET domains = ? WHERE id = 1').run(JSON.stringify(normalized));
		this.domains.splice(0, this.domains.length, ...normalized);
		return [...this.domains];
	}
}
