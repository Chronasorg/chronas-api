import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

import {
  querySparql,
  queryAt,
  entityByQid,
  enwikiSitelink,
  loadTemplate,
  renderTemplate,
  extractValue,
  extractYear,
  _internals
} from '../../../../scripts/data-validation/wikidata-client.js';

function fakeFetch(response) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => response
    };
  };
  fn.calls = () => calls;
  return fn;
}

function makeBindings(bindings) {
  return { results: { bindings } };
}

describe('wikidata-client', () => {
  beforeEach(() => {
    _internals.resetRateLimiter();
    _internals.resetTemplateCache();
    if (fs.existsSync(_internals.CACHE_DIR)) {
      fs.rmSync(_internals.CACHE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(_internals.CACHE_DIR)) {
      fs.rmSync(_internals.CACHE_DIR, { recursive: true });
    }
  });

  describe('extractYear', () => {
    it('parses positive ISO years', () => {
      const b = { d: { value: '+1607-01-01T00:00:00Z' } };
      expect(extractYear(b, 'd')).to.equal(1607);
    });

    it('parses negative ISO years (BCE)', () => {
      const b = { d: { value: '-13000-01-01T00:00:00Z' } };
      expect(extractYear(b, 'd')).to.equal(-13000);
    });

    it('returns null for missing field', () => {
      expect(extractYear({}, 'd')).to.equal(null);
    });
  });

  describe('extractValue', () => {
    it('returns binding value', () => {
      expect(extractValue({ x: { value: 'foo' } }, 'x')).to.equal('foo');
    });
    it('returns null for missing field', () => {
      expect(extractValue({}, 'x')).to.equal(null);
    });
  });

  describe('renderTemplate', () => {
    it('substitutes numbers and QIDs', () => {
      const out = renderTemplate('SELECT ?x WHERE { wd:{{qid}} ?p {{year}} }', { qid: 'Q42', year: 1607 });
      expect(out).to.equal('SELECT ?x WHERE { wd:Q42 ?p 1607 }');
    });

    it('throws on missing parameter', () => {
      expect(() => renderTemplate('{{missing}}', {})).to.throw(/Missing SPARQL/);
    });
  });

  describe('loadTemplate', () => {
    it('loads entity-by-qid template', () => {
      const tpl = loadTemplate('entity-by-qid');
      expect(tpl).to.include('{{qid}}');
    });

    it('throws on unknown template', () => {
      expect(() => loadTemplate('does-not-exist')).to.throw(/template not found/);
    });
  });

  describe('querySparql cache', () => {
    it('writes a cache entry on first call and reads it on second', async () => {
      const f = fakeFetch(makeBindings([{ x: { value: '1' } }]));
      const r1 = await querySparql('SELECT ?x WHERE {}', { fetchImpl: f });
      const r2 = await querySparql('SELECT ?x WHERE {}', { fetchImpl: f });
      expect(r1).to.deep.equal(r2);
      expect(f.calls()).to.equal(1);
    });

    it('bypassCache forces a fresh request and skips cache write', async () => {
      const f = fakeFetch(makeBindings([{ x: { value: '1' } }]));
      await querySparql('SELECT ?x WHERE {}', { fetchImpl: f, bypassCache: true });
      await querySparql('SELECT ?x WHERE {}', { fetchImpl: f, bypassCache: true });
      expect(f.calls()).to.equal(2);
      expect(fs.existsSync(_internals.CACHE_DIR)).to.equal(false);
    });

    it('useCachedOnly throws when there is no cache hit', async () => {
      try {
        await querySparql('SELECT ?missing WHERE {}', { useCachedOnly: true, fetchImpl: fakeFetch(makeBindings([])) });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/No cached result/);
      }
    });

    it('useCachedOnly returns cached bindings when present', async () => {
      const f = fakeFetch(makeBindings([{ x: { value: 'cached' } }]));
      await querySparql('SELECT ?cached WHERE {}', { fetchImpl: f });
      const r = await querySparql('SELECT ?cached WHERE {}', { useCachedOnly: true, fetchImpl: fakeFetch(makeBindings([])) });
      expect(r[0].x.value).to.equal('cached');
    });
  });

  describe('entityByQid', () => {
    it('returns null when Wikidata has no record', async () => {
      const f = fakeFetch(makeBindings([]));
      const r = await entityByQid('Q12345', { fetchImpl: f });
      expect(r).to.equal(null);
    });

    it('returns parsed entity for a binding', async () => {
      const f = fakeFetch(makeBindings([{
        itemLabel: { value: 'Powhatan Confederacy' },
        start: { value: '+1570-01-01T00:00:00Z' },
        end: { value: '+1646-01-01T00:00:00Z' },
        coord: { value: 'Point(-76.7 37.5)' }
      }]));
      const r = await entityByQid('Q1262048', { fetchImpl: f });
      expect(r.qid).to.equal('Q1262048');
      expect(r.start).to.equal(1570);
      expect(r.end).to.equal(1646);
      expect(r.label).to.equal('Powhatan Confederacy');
    });

    it('rejects invalid QID', async () => {
      try {
        await entityByQid('not-a-qid', { fetchImpl: fakeFetch(makeBindings([])) });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/Invalid QID/);
      }
    });
  });

  describe('enwikiSitelink', () => {
    function makeRestFetch(payload) {
      return async () => ({
        ok: true,
        status: 200,
        json: async () => payload
      });
    }

    it('returns the underscored enwiki page title for a QID', async () => {
      const f = makeRestFetch({
        entities: {
          Q578878: {
            sitelinks: {
              enwiki: { title: 'Powhatan (Native American leader)' }
            }
          }
        }
      });
      const slug = await enwikiSitelink('Q578878', { fetchImpl: f });
      expect(slug).to.equal('Powhatan_(Native_American_leader)');
    });

    it('returns null when the entity has no enwiki sitelink', async () => {
      const f = makeRestFetch({ entities: { Q42: { sitelinks: {} } } });
      const slug = await enwikiSitelink('Q42', { fetchImpl: f });
      expect(slug).to.equal(null);
    });

    it('rejects an invalid QID', async () => {
      try {
        await enwikiSitelink('not-a-qid', { fetchImpl: makeRestFetch({}) });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/Invalid QID/);
      }
    });
  });

  describe('queryAt', () => {
    it('rejects non-numeric coordinates', async () => {
      try {
        await queryAt({ lat: 'foo', lon: 0, year: 1600 }, { fetchImpl: fakeFetch(makeBindings([])) });
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/numeric lat, lon, year/);
      }
    });

    it('returns parsed bindings via entity-at-location template', async () => {
      const f = fakeFetch(makeBindings([{
        item: { value: 'http://www.wikidata.org/entity/Q42' },
        itemLabel: { value: 'Test' },
        coord: { value: 'Point(-76.7 37.5)' }
      }]));
      const out = await queryAt({ lat: 37.5, lon: -76.7, year: 1600 }, { fetchImpl: f });
      expect(out.length).to.equal(1);
      expect(out[0].label).to.equal('Test');
    });
  });
});

describe('SPARQL template files exist', () => {
  const dir = _internals.SPARQL_DIR;
  ['entity-by-qid', 'polity-at-location', 'entity-at-location', 'events-in-region', 'people-active-at']
    .forEach(name => {
      it(`${name}.rq exists`, () => {
        expect(fs.existsSync(path.join(dir, `${name}.rq`))).to.equal(true);
      });
    });
});
