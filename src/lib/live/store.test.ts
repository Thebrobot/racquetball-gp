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
});
