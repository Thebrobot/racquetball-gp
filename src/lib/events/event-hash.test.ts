import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventHashScrollTop, eventPanelFromHash } from './event-hash';

describe('eventPanelFromHash', () => {
	it('maps #brackets and #participants', () => {
		assert.equal(eventPanelFromHash('#brackets'), 'brackets');
		assert.equal(eventPanelFromHash('#participants'), 'participants');
	});

	it('maps #panel-brackets and #panel-participants', () => {
		assert.equal(eventPanelFromHash('#panel-brackets'), 'brackets');
		assert.equal(eventPanelFromHash('#panel-participants'), 'participants');
	});

	it('accepts the bare id without a leading hash', () => {
		assert.equal(eventPanelFromHash('brackets'), 'brackets');
		assert.equal(eventPanelFromHash('panel-participants'), 'participants');
	});

	it('is case-insensitive and trims space', () => {
		assert.equal(eventPanelFromHash('#Participants'), 'participants');
		assert.equal(eventPanelFromHash('  #PANEL-BRACKETS  '), 'brackets');
	});

	it('ignores unrelated hashes', () => {
		assert.equal(eventPanelFromHash(''), null);
		assert.equal(eventPanelFromHash('#'), null);
		assert.equal(eventPanelFromHash('#watch-live'), null);
		assert.equal(eventPanelFromHash('#undefined'), null);
		assert.equal(eventPanelFromHash(null), null);
	});
});

describe('eventHashScrollTop', () => {
	it('leaves room under a fixed header', () => {
		assert.equal(eventHashScrollTop(400, 70), 318);
	});

	it('does not scroll above the page', () => {
		assert.equal(eventHashScrollTop(40, 80), 0);
	});
});
