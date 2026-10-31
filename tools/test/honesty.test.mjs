// The honesty check's fixture text (tools/checks/honesty.mjs FIXTURE_TEXT): every name and note the fixture
// serves is caught if it ever reaches data/portfolio.js or a deployed file, and the real data is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import real from '../../data/portfolio.js';
import { fixtureData } from '../lib/fixture.mjs';
import { FIXTURE_TEXT } from '../checks/honesty.mjs';

const caught = s => new RegExp(FIXTURE_TEXT.source).test(String(s));

test('the fixture\'s films, people, notes and laurels are all fixture text', () => {
  const fx = fixtureData(), f = fx.films[0];
  const text = [
    ...fx.person.tenFilms.flatMap(t => [t.title, t.dp, t.note]),
    f.director, f.production, f.logline, f.madeAt.name, ...f.crew.map(c => c.name),
    f.premiere.event, ...f.awards.flatMap(a => [a.title, a.event]), ...f.references.map(r => r.title),
    ...fx.photographs.series.map(s => s.title),
  ];
  assert.deepEqual(text.filter(s => !caught(s)), []);
});

test('the real data holds none of it; the samples\' template text ("Director Name") is not mistaken for it', () => {
  assert.deepEqual(JSON.stringify(real).match(FIXTURE_TEXT), null);
  assert.equal(caught('Director Name'), false);
  assert.equal(caught('Director Name Surname'), false);
});
