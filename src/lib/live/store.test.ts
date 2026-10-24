import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	BLOB_READ_FRESH_TIMEOUT_MS,
	BLOB_READ_TIMEOUT_MS,
	blobReadOptions,
	getBundledResults,
} from './store';

describe('blobReadOptions', () => {
	it('defaults to a 2s abort so event pages cannot hang on Blob', () => {
		const opts = blobReadOptions();
		assert.equal(opts.access, 'public');
		assert.equal(opts.useCache, true);
		assert.equal(opts.abortSignal.aborted, false);
		assert.equal(BLOB_READ_TIMEOUT_MS, 2_000);
		assert.equal(BLOB_READ_FRESH_TIMEOUT_MS, 10_000);
	});

	it('lets the cron ask for a fresh, longer read', () => {
		const opts = blobReadOptions({ timeoutMs: BLOB_READ_FRESH_TIMEOUT_MS, useCache: false });
		assert.equal(opts.useCache, false);
		assert.ok(opts.abortSignal);
	});
});

describe('getBundledResults', () => {
	it('serves committed Port St. Lucie brackets when Blob is skipped', () => {
		const bundled = getBundledResults('port-st-lucie-open');
		assert.ok(bundled.lastUpdated);
		assert.ok(Object.keys(bundled.divisions ?? {}).length >= 8);
	});

	it('applies unread PSL overrides so a blocked cron still shows them after deploy', () => {
		const bundled = getBundledResults('port-st-lucie-open');
		assert.equal(bundled.divisions['mens-age-60']?.['M60+8']?.winner, 1);
		assert.equal(bundled.divisions['mens-age-60']?.['M60+8']?.court, 'Court 3');
		assert.equal(bundled.divisions['mens-age-50']?.['M50+4']?.winner, 1);
		assert.equal(bundled.divisions['mens-age-50']?.['M50+4']?.player2, 'Ben Kniesly');
		assert.equal(bundled.divisions['mens-doubles-b']?.MBD3?.court, 'Court 2');
	});
});
