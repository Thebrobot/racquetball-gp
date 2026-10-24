import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAddPhotoTag, canRemovePhotoTag, type PhotoTagActor } from './photo-tags';

const fan: PhotoTagActor = { signedIn: true, userId: 'fan', isAdmin: false, playerSlug: null };
const annie: PhotoTagActor = { signedIn: true, userId: 'annie', isAdmin: false, playerSlug: 'annie-sanchez' };
const admin: PhotoTagActor = { signedIn: true, userId: 'admin', isAdmin: true, playerSlug: null };
const guest: PhotoTagActor = { signedIn: false, userId: null, isAdmin: false, playerSlug: null };

describe('canAddPhotoTag', () => {
	it('allows any signed-in user and blocks guests', () => {
		assert.equal(canAddPhotoTag(fan), true);
		assert.equal(canAddPhotoTag(guest), false);
	});
});

describe('canRemovePhotoTag', () => {
	it('lets the tagger remove their tag', () => {
		assert.equal(canRemovePhotoTag(fan, { slug: 'scott-haacke', taggedBy: 'fan' }), true);
		assert.equal(canRemovePhotoTag(fan, { slug: 'scott-haacke', taggedBy: 'other' }), false);
	});

	it('lets the tagged player\'s account owner remove a tag', () => {
		assert.equal(canRemovePhotoTag(annie, { slug: 'annie-sanchez', taggedBy: 'fan' }), true);
		assert.equal(canRemovePhotoTag(annie, { slug: 'scott-haacke', taggedBy: 'fan' }), false);
	});

	it('lets admins remove any tag', () => {
		assert.equal(canRemovePhotoTag(admin, { slug: 'scott-haacke', taggedBy: 'fan' }), true);
	});

	it('blocks guests', () => {
		assert.equal(canRemovePhotoTag(guest, { slug: 'scott-haacke', taggedBy: 'fan' }), false);
	});
});
