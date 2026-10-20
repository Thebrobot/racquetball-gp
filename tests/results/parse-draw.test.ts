import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDivisionList } from '../../src/lib/results/parse-divisions.ts';
import { parseDrawPage } from '../../src/lib/results/parse-draw.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(dir, 'fixtures', name), 'utf-8');

describe('parseDivisionList', () => {
	it('discovers divID/combinedID, codes, and formats without hardcoding', () => {
		const divs = parseDivisionList(fixture('list-divs.html'));
		assert.equal(divs.length, 3);
		assert.deepEqual(
			divs.map((d) => ({ divID: d.divID, combinedID: d.combinedID, code: d.code, format: d.format })),
			[
				{ divID: 0, combinedID: 237423, code: 'MS3545', format: 'roundrobin' },
				{ divID: 26, combinedID: 0, code: 'M60+', format: 'roundrobin' },
				{ divID: 0, combinedID: 237520, code: 'XDP1', format: 'playoff' },
			],
		);
	});
});

describe('parseDrawPage', () => {
	it('collects round-robin match IDs and related draws', () => {
		const draw = parseDrawPage(fixture('draw-rr.html'), {
			divID: 0,
			combinedID: 237423,
			finalUrl: 'https://www.r2sports.com/tourney/drawsOut/roundRobin.asp?TID=52059&divID=0&combinedID=237423',
		});
		assert.equal(draw.format, 'roundrobin');
		assert.equal(draw.code, 'MS3545');
		assert.deepEqual(
			draw.matches.map((m) => m.matchId),
			['MS354510', 'MS35459', 'MS354515'],
		);
		assert.deepEqual(draw.relatedDraws, [{ divID: 0, combinedID: 237524 }]);
	});

	it('collects elimination match codes', () => {
		const draw = parseDrawPage(fixture('draw-elim.html'), {
			divID: 879,
			combinedID: 0,
			finalUrl: 'https://www.r2sports.com/tourney/drawsOut/view-bracket.asp?TID=50993&divID=879&combinedID=0',
		});
		assert.equal(draw.format, 'elimination');
		assert.deepEqual(
			draw.matches.map((m) => m.matchId),
			['B10D9', 'B10D8', 'B10D5'],
		);
	});
});
