import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	formatLiveDayLabel,
	formatLiveRelativeTime,
	formatLiveSyncedAt,
	formatLiveWhen,
} from './format-display-time';

describe('formatLiveWhen', () => {
	it('renders 14:50 UTC Oct 24 as 10:50 AM Eastern', () => {
		assert.equal(formatLiveWhen('2026-10-24T14:50:00.000Z'), 'Oct 24, 10:50 AM');
	});

	it('does not show the UTC clock time', () => {
		assert.notEqual(formatLiveWhen('2026-10-24T14:50:00.000Z'), 'Oct 24, 2:50 PM');
	});

	it('returns empty for invalid input', () => {
		assert.equal(formatLiveWhen('not-a-date'), '');
	});
});

describe('formatLiveSyncedAt', () => {
	it('includes the Eastern zone name', () => {
		assert.equal(formatLiveSyncedAt('2026-10-24T14:50:00.000Z'), 'Oct 24, 10:50 AM EDT');
		assert.equal(formatLiveSyncedAt(null), 'Not yet synced');
	});
});

describe('formatLiveDayLabel', () => {
	it('groups by the Eastern calendar day', () => {
		assert.equal(formatLiveDayLabel('2026-10-24T14:50:00.000Z'), 'Saturday, October 24');
		// 23:58 UTC Oct 23 is still Friday evening in ET
		assert.equal(formatLiveDayLabel('2026-10-23T23:58:43.880Z'), 'Friday, October 23');
	});
});

describe('formatLiveRelativeTime', () => {
	it('falls back to Eastern clock time after a day', () => {
		const now = Date.parse('2026-10-25T16:00:00.000Z');
		assert.equal(formatLiveRelativeTime('2026-10-24T14:50:00.000Z', now), 'Oct 24, 10:50 AM');
	});

	it('keeps relative wording while fresh', () => {
		const now = Date.parse('2026-10-24T15:16:00.000Z');
		assert.equal(formatLiveRelativeTime('2026-10-24T14:50:00.000Z', now), '26 min ago');
	});
});
