import { expect } from 'chai';
import { FIXES, DIMENSIONS, checkTargets, dropFailed } from '../../../scripts/data-validation/dimension-wiki-links.js';
import { planFixes, planRevert } from '../../../scripts/data-validation/ruler-wiki-links.js';

const LEFT_ON_PURPOSE = ['carib', 'nordic', 'pontic', 'sidamo', '_Venise', 'dongye', 'test_field'];

const culture = () => ({
  bengali: ['Bengali', 'rgb(1,2,3)', 'Bengali', 'b.jpg'],
  _Eyland: ['Eyland', 'rgb(4,5,6)', '%C3%96land'],
  _Eblaite: ['Eblaite', 'rgb(7,8,9)', 'Ebla#People,_language,_and_culture'],
  carib: ['Carib', 'rgb(0,0,0)', 'Carib'] // left unchanged on purpose
});
const subset = (ids) => Object.fromEntries(ids.map((id) => [id, FIXES.culture[id]]));
const THREE = subset(['bengali', '_Eyland', '_Eblaite']);

// A Wikipedia API answer in formatversion=2 shape.
const wikipedia = (answer) => async (url, options) => {
  expect(options.headers['User-Agent']).to.match(/Chronas/);
  const titles = new URL(url).searchParams.get('titles').split('|');
  expect(titles.length).to.be.at.most(50);
  return { ok: true, json: async () => ({ query: answer(titles) }) };
};

describe('culture and religion wiki links', () => {
  it('covers culture and religion only, with different, plain article titles', () => {
    expect(DIMENSIONS).to.deep.equal(['culture', 'religion']);
    expect(Object.keys(FIXES.culture)).to.have.length(23);
    expect(Object.keys(FIXES.religion)).to.have.length(3);
    for (const dimension of DIMENSIONS) {
      for (const [id, [from, to]] of Object.entries(FIXES[dimension])) {
        expect(to, id).to.be.a('string').and.not.equal(from);
        expect(to, id).to.not.match(/%[0-9A-Fa-f]{2}|#|\s/);
      }
    }
    for (const id of LEFT_ON_PURPOSE) expect(FIXES.culture).to.not.have.property(id);
  });

  it('changes only the wiki link of the listed entries', () => {
    const live = culture();
    const { changes, conflicts } = planFixes(live, THREE);
    expect(conflicts).to.deep.equal([]);
    expect(changes.bengali.after).to.deep.equal(['Bengali', 'rgb(1,2,3)', 'Bengalis', 'b.jpg']);
    expect(changes._Eyland.after[2]).to.equal('Öland');
    expect(changes._Eblaite.after[2]).to.equal('Ebla');
    expect(changes).to.not.have.property('carib');
    expect(live.bengali[2]).to.equal('Bengali');
  });

  it('refuses an entry whose link is neither the old nor the new one', () => {
    const live = culture();
    live._Eyland[2] = 'Somewhere_else';
    const { conflicts } = planFixes(live, THREE);
    expect(conflicts).to.have.length(1);
    expect(conflicts[0]).to.match(/^_Eyland/);
  });

  it('reverts only what is still as written', () => {
    const { changes } = planFixes(culture(), THREE);
    const fixed = culture();
    for (const [id, { after }] of Object.entries(changes)) fixed[id] = after;
    expect(planRevert(fixed, changes).changes._Eyland.after[2]).to.equal('%C3%96land');
    fixed.bengali = ['Bengali', 'rgb(1,2,3)', 'Bengal', 'b.jpg'];
    expect(planRevert(fixed, changes).conflicts).to.deep.equal(['bengali: changed since the fix']);
  });

  it('flags missing and disambiguation targets, following normalization and redirects', async () => {
    const fetchImpl = wikipedia(() => ({
      normalized: [{ from: 'Boii_(Bohemia)', to: 'Boii (Bohemia)' }, { from: 'Qasim_Tatars', to: 'Qasim Tatars' }],
      redirects: [{ from: 'Qasim Tatars', to: 'Qasim Khanate' }],
      pages: [
        { title: 'Boii (Bohemia)', pageid: 1 },
        { title: 'Qasim Khanate', pageid: 2, pageprops: { disambiguation: '' } },
        { title: 'Nowhere', missing: true }
      ]
    }));
    const problems = await checkTargets(['Boii_(Bohemia)', 'Qasim_Tatars', 'Nowhere'], { fetchImpl });
    expect(problems).to.deep.equal({ Qasim_Tatars: 'disambiguation page', Nowhere: 'missing' });
  });

  it('asks about at most 50 titles per request', async () => {
    let calls = 0;
    const fetchImpl = wikipedia((titles) => { calls += 1; return { pages: titles.map(title => ({ title })) }; });
    const titles = Array.from({ length: 120 }, (_, i) => `T${i}`);
    expect(await checkTargets(titles, { fetchImpl })).to.deep.equal({});
    expect(calls).to.equal(3);
  });

  it('leaves the links whose target failed the check', () => {
    const { changes } = planFixes(culture(), THREE);
    const { kept, failed } = dropFailed(changes, { Ebla: 'missing' });
    expect(Object.keys(kept)).to.have.members(['bengali', '_Eyland']);
    expect(failed).to.deep.equal(['_Eblaite: Ebla is missing']);
  });
});
