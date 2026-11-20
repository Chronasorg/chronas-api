import { expect } from 'chai';
import { FIXES, planFixes, planRevert } from '../../../scripts/data-validation/issue-64-ruler-wikis.js';

const live = () => ({
  LOI: ['The Isles', 'rgb(0,105,104)', 'Isle', ''],
  DMS: ['Munster', 'rgb(205,103,80)', 'Munster_Rugby', '7/7d/Flag_of_Munster.svg'],
  MCM: ['Desmond', 'rgb(179,89,89)', 'Desmond', ''],
  TYR: ['Tyrone', 'rgb(131,101,85)', 'Tyrone', 'flag.jpg'],
  MTH: ['Meath', 'rgb(15,128,253)', 'Meath', ''],
  LEI: ['Leinster', 'rgb(48,164,51)', 'Leinster', '8/8d/Flag_of_Leinster.svg'],
  IRE: ['Ireland', 'rgb(112,150,105)', 'Ireland', '']
});

describe('issue #64 ruler wiki links', () => {
  it('changes only the wiki link of the listed rulers', () => {
    const ruler = live();
    const { changes, conflicts } = planFixes(ruler);
    expect(conflicts).to.deep.equal([]);
    expect(Object.keys(changes)).to.have.members(Object.keys(FIXES));
    expect(changes.LOI.after).to.deep.equal(['The Isles', 'rgb(0,105,104)', 'Kingdom_of_the_Isles', '']);
    expect(changes.DMS.after[3]).to.equal('7/7d/Flag_of_Munster.svg');
    expect(ruler.LOI[2]).to.equal('Isle'); // the input is not mutated
  });

  it('skips entries already fixed and refuses entries someone else changed', () => {
    const ruler = live();
    ruler.LOI[2] = 'Kingdom_of_the_Isles';
    ruler.TYR[2] = 'Tyrone_(something_else)';
    const { changes, done, conflicts } = planFixes(ruler);
    expect(done).to.deep.equal(['LOI']);
    expect(conflicts).to.have.length(1);
    expect(conflicts[0]).to.match(/^TYR/);
    expect(changes).to.not.have.property('LOI');
  });

  it('reverts only what is still as written', () => {
    const { changes } = planFixes(live());
    const fixed = { ...live() };
    for (const [id, { after }] of Object.entries(changes)) fixed[id] = after;
    expect(planRevert(fixed, changes).conflicts).to.deep.equal([]);
    expect(planRevert(fixed, changes).changes.LOI.after[2]).to.equal('Isle');
    fixed.MTH = ['Meath', 'rgb(0,0,0)', 'Kingdom_of_Meath', ''];
    expect(planRevert(fixed, changes).conflicts).to.deep.equal(['MTH: changed since the fix']);
  });
});
