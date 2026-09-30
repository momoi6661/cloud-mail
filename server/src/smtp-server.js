import { SMTPServer } from 'smtp-server';
import { processInboundEmail } from './email-webhook.js';

function collect(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on('data', chunk => chunks.push(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolve(Buffer.concat(chunks)));
	});
}

export function startSmtpServer({ config, env }) {
	const server = new SMTPServer({
		name: config.smtpName || 'cloud-mail',
		banner: config.smtpBanner || 'Cloud Mail SMTP',
		authOptional: true,
		allowInsecureAuth: true,
		disabledCommands: ['AUTH', 'STARTTLS'],
		// Recipient policy is enforced by the existing application after MIME parsing.
		onRcptTo(address, session, callback) {
			callback();
		},
		async onData(stream, session, callback) {
			try {
				const raw = await collect(stream);
				const recipients = session.envelope.rcptTo || [];
				if (recipients.length === 0) {
					const error = new Error('Missing recipient');
					error.responseCode = 550;
					return callback(error);
				}

				for (const recipient of recipients) {
					const result = await processInboundEmail({ raw, to: recipient.address }, env);
					if (!result.accepted) {
						const error = new Error(result.reason || 'Message rejected');
						error.responseCode = result.status || 550;
						return callback(error);
					}
				}
				callback();
			} catch (error) {
				callback(error);
			}
		}
	});

	server.listen(config.smtpPort, config.smtpHost, () => {
		console.log(`Cloud Mail SMTP listening on ${config.smtpHost}:${config.smtpPort}`);
	});

	return server;
}
