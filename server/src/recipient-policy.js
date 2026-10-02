export function isLocalRecipient(address, env) {
	if (typeof address !== 'string') return false;
	const parts = address.trim().split('@');
	if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
	const domain = parts[1].toLowerCase();
	return (env.domainProvider?.domains || env.domain || []).some(
		configured => String(configured).replace(/^@/, '').toLowerCase() === domain
	);
}
