import { expect } from 'chai';
import { FIXES, planFixes, planRevert } from '../../../scripts/data-validation/ruler-wiki-links.js';

const live = () => ({
  KNG: ['Kong', 'rgb(1,2,3)', 'Kong', 'kong.svg'],
  CMG: ['Commagane', 'rgb(4,5,6)', 'Commagane', ''],
  GDR: ['Gadir', 'rgb(7,8,9)', 'C%C3%A1diz', ''],
  _Zealand: ['Zealand', 'rgb(0,0,0)', 'Zealand#History', ''],
  GEO: ['Georgia', 'rgb(9,9,9)', 'Georgia', ''] // left unchanged on purpose
});
const subset = (ids) => Object.fromEntries(ids.map((id) => [id, FIXES[id]]));
const FOUR = subset(['KNG', 'CMG', 'GDR', '_Zealand']);

describe('ruler wiki links', () => {
  it('maps every fix to a different, plain article title', () => {
    for (const [id, [from, to]] of Object.entries(FIXES)) {
      expect(to, id).to.be.a('string').and.not.equal(from);
      expect(to, id).to.not.match(/%[0-9A-Fa-f]{2}|#|\s/);
    }
    expect(FIXES).to.not.have.property('GEO');
  });

  it('changes only the wiki link of the listed rulers', () => {
    const ruler = live();
    const { changes, conflicts } = planFixes(ruler, FOUR);
    expect(conflicts).to.deep.equal([]);
    expect(Object.keys(changes)).to.have.members(Object.keys(FOUR));
    expect(changes.KNG.after).to.deep.equal(['Kong', 'rgb(1,2,3)', 'Kong_Empire', 'kong.svg']);
    expect(changes.CMG.after[2]).to.equal('Commagene');
    expect(changes.GDR.after[2]).to.equal('Cádiz');
    expect(changes._Zealand.after[2]).to.equal('Zealand');
    expect(ruler.KNG[2]).to.equal('Kong'); // the input is not mutated
  });

  it('skips entries already fixed and refuses entries someone else changed', () => {
    const ruler = live();
    ruler.KNG[2] = 'Kong_Empire';
    ruler.CMG[2] = 'Commagene_(something_else)';
    const { changes, done, conflicts } = planFixes(ruler, FOUR);
    expect(done).to.deep.equal(['KNG']);
    expect(conflicts).to.have.length(1);
    expect(conflicts[0]).to.match(/^CMG/);
    expect(changes).to.not.have.property('KNG');
  });

  it('reports a missing ruler as a conflict', () => {
    const ruler = live();
    delete ruler.GDR;
    expect(planFixes(ruler, FOUR).conflicts).to.deep.equal(['GDR: missing']);
  });

  it('reverts only what is still as written', () => {
    const { changes } = planFixes(live(), FOUR);
    const fixed = { ...live() };
    for (const [id, { after }] of Object.entries(changes)) fixed[id] = after;
    expect(planRevert(fixed, changes).conflicts).to.deep.equal([]);
    expect(planRevert(fixed, changes).changes.GDR.after[2]).to.equal('C%C3%A1diz');
    fixed.CMG = ['Commagane', 'rgb(0,0,0)', 'Commagene', ''];
    expect(planRevert(fixed, changes).conflicts).to.deep.equal(['CMG: changed since the fix']);
  });
});
