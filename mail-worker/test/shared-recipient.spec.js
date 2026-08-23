import { describe, expect, it } from 'vitest';
import {
	emailMatchesSharedRecipients,
	mergeSharedRecipients,
	normalizeSharedRecipients
} from '../src/service/role-service';

describe('shared mail recipient filtering', () => {
	it('normalizes and de-duplicates configured recipients', () => {
		expect(normalizeSharedRecipients([
			' Opacity_Dent_0o@iCloud.com ',
			'opacity_dent_0o@icloud.com',
			'another@icloud.com'
		])).toEqual(['opacity_dent_0o@icloud.com', 'another@icloud.com']);
	});

	it('combines role recipients with personal additions', () => {
		expect(mergeSharedRecipients(
			['shared@icloud.com', 'common@icloud.com'],
			['personal@icloud.com', 'SHARED@icloud.com']
		)).toEqual(['shared@icloud.com', 'common@icloud.com', 'personal@icloud.com']);
	});

	it('matches the original To header of mail forwarded through the admin mailbox', () => {
		const email = {
			toEmail: 'icloud@hi.riria.org',
			recipient: JSON.stringify([{ address: 'opacity_dent_0o@icloud.com', name: '' }])
		};

		expect(emailMatchesSharedRecipients(email, ['opacity_dent_0o@icloud.com'])).toBe(true);
		expect(emailMatchesSharedRecipients(email, ['someone_else@icloud.com'])).toBe(false);
	});

	it('matches the SMTP recipient when there is no useful To header', () => {
		const email = {
			toEmail: 'direct@hi.riria.org',
			recipient: '[]'
		};

		expect(emailMatchesSharedRecipients(email, ['DIRECT@hi.riria.org'])).toBe(true);
	});

	it('does not grant access for malformed legacy recipient data', () => {
		const email = {
			toEmail: 'icloud@hi.riria.org',
			recipient: '{not-json'
		};

		expect(emailMatchesSharedRecipients(email, ['opacity_dent_0o@icloud.com'])).toBe(false);
	});
});
