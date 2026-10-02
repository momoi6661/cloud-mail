import { email } from '../../mail-worker/src/email/email.js';
import { isLocalRecipient } from './recipient-policy.js';

function header(c, name) {
	return c.req.header(name) || c.req.header(name.toLowerCase());
}

export async function processInboundEmail({ raw, to }, env) {
	if (!to) return { accepted: false, status: 400, reason: 'missing recipient' };
	if (!isLocalRecipient(to, env)) {
		return { accepted: false, status: 422, reason: 'Recipient domain is not hosted here' };
	}
	let rejected = null;
	const message = {
		to,
		raw: new Response(raw).body,
		setReject(reason) {
			rejected = reason;
		},
		async forward() {
			throw new Error('服务器版暂未实现入站邮件二次转发');
		}
	};

	await email(message, env, undefined);
	if (rejected) return { accepted: false, status: 422, reason: rejected };
	return { accepted: true, status: 200 };
}

export async function handleInboundEmail(c, env) {
	if (env.inboundEmailToken) {
		const supplied = header(c, 'authorization')?.replace(/^Bearer\s+/i, '') || header(c, 'x-inbound-token');
		if (supplied !== env.inboundEmailToken) {
			return c.json({ error: 'unauthorized' }, 401);
		}
	}

	const to = header(c, 'x-envelope-to') || header(c, 'x-original-to') || c.req.query('to');
	const raw = await c.req.arrayBuffer();
	const result = await processInboundEmail({ raw, to }, env);
	return c.json(result, result.status);
}
