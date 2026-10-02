import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalRecipient } from '../src/recipient-policy.js';

test('only exact configured recipient domains are accepted', () => {
	const env = { domain: ['riria.org', 'hi.riria.org'] };
	for (const address of ['admin@riria.org', 'user@hi.riria.org', 'user@RIRIA.ORG']) {
		assert.equal(isLocalRecipient(address, env), true);
	}
	for (const address of ['user@hood.edu', 'user@evilriria.org', 'user@other.riria.org', '@riria.org', 'a@b@riria.org']) {
		assert.equal(isLocalRecipient(address, env), false);
	}
});

test('recipient policy follows runtime domain changes', () => {
	const domains = ['riria.org'];
	const env = { domainProvider: { domains } };
	assert.equal(isLocalRecipient('a@riria.org', env), true);
	domains.splice(0, 1, 'hi.riria.org');
	assert.equal(isLocalRecipient('a@riria.org', env), false);
	assert.equal(isLocalRecipient('a@hi.riria.org', env), true);
});
