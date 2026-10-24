import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	SUBMISSION_ALERT_WINDOW_MS,
	deliversInstantly,
	groupPendingByUploader,
	photoApprovedCopy,
	shouldCreateSubmissionAlert,
	submissionDigestCopy,
	submissionDigestLine,
	summarizeApprovals,
} from './copy';

describe('deliversInstantly', () => {
	it('holds like and submission for the digest, same as each other', () => {
		assert.equal(deliversInstantly('like'), false);
		assert.equal(deliversInstantly('submission'), false);
	});

	it('sends the other kinds right away', () => {
		assert.equal(deliversInstantly('photo_approved'), true);
		assert.equal(deliversInstantly('comment'), true);
		assert.equal(deliversInstantly('tagged'), true);
		assert.equal(deliversInstantly('claim_approved'), true);
		assert.equal(deliversInstantly('result'), true);
	});
});

describe('shouldCreateSubmissionAlert', () => {
	it('creates one admin alert for the first photo in a 15-minute batch', () => {
		assert.equal(SUBMISSION_ALERT_WINDOW_MS, 15 * 60 * 1000);
		assert.equal(shouldCreateSubmissionAlert(0), true);
		assert.equal(shouldCreateSubmissionAlert(1), false);
		assert.equal(shouldCreateSubmissionAlert(11), false);
	});
});

describe('photoApprovedCopy', () => {
	it('keeps the single-photo wording', () => {
		const copy = photoApprovedCopy(1);
		assert.equal(copy.heading, 'Your photo is in the gallery');
		assert.equal(copy.subject, 'Your photo is in the gallery');
	});

	it('uses the batch summary for approve_all', () => {
		const copy = photoApprovedCopy(12);
		assert.equal(copy.heading, '12 photos are now in the gallery');
		assert.equal(copy.subject, '12 photos are now in the gallery');
		assert.equal(copy.pushBody, '12 photos are now in the gallery');
	});
});

describe('submissionDigestCopy', () => {
	it('names one uploader and the photo count', () => {
		assert.equal(submissionDigestLine('Daniel', 12), 'Daniel sent 12 photos for review');
		assert.equal(submissionDigestLine('Daniel', 1), 'Daniel sent 1 photo for review');
		const one = submissionDigestCopy([{ name: 'Daniel', count: 12 }]);
		assert.equal(one.heading, 'Daniel sent 12 photos for review');
	});

	it('joins several uploaders into one admin email', () => {
		const many = submissionDigestCopy([
			{ name: 'Daniel', count: 12 },
			{ name: 'Sarah', count: 3 },
		]);
		assert.equal(many.heading, 'New photos to review');
		assert.equal(many.intro, 'Daniel sent 12 photos for review. Sarah sent 3 photos for review.');
	});
});

describe('groupPendingByUploader', () => {
	it('counts pending photos per uploader and can filter to notified actors', () => {
		const pending = [{ user_id: 'd' }, { user_id: 'd' }, { user_id: 's' }];
		const names = { d: 'Daniel', s: 'Sarah' };
		assert.deepEqual(groupPendingByUploader(pending, names), [
			{ userId: 'd', name: 'Daniel', count: 2 },
			{ userId: 's', name: 'Sarah', count: 1 },
		]);
		assert.deepEqual(groupPendingByUploader(pending, names, ['d']), [{ userId: 'd', name: 'Daniel', count: 2 }]);
	});
});

describe('summarizeApprovals', () => {
	it('collapses per-photo approvals into one summary per uploader', () => {
		const summaries = summarizeApprovals([
			{ user_id: 'd', id: 'p1', album: 'ocala' },
			{ user_id: 'd', id: 'p2', album: 'ocala' },
			{ user_id: 's', id: 'p3', album: 'psl' },
		]);
		assert.deepEqual(summaries, [
			{ userId: 'd', count: 2, photoId: 'p1', album: 'ocala' },
			{ userId: 's', count: 1, photoId: 'p3', album: 'psl' },
		]);
	});
});
