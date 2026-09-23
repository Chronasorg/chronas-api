import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';

import { loadCampaign } from '../../../../scripts/data-validation/campaign-loader.js';

function tmpFile(json) {
  const file = path.join(os.tmpdir(), `campaign-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(json));
  return file;
}

describe('campaign-loader', () => {
  it('loads a valid polity campaign', () => {
    const file = tmpFile({
      issue: 136,
      title: 'Test',
      campaigns: [{
        type: 'polity',
        name: 'Powhatan',
        wikidataQid: 'Q1262048',
        yearStart: 1570,
        yearEnd: 1646,
        chronasProvinces: ['Powhatan'],
        proposedRulerCode: 'POW',
        citations: [{ source: 'Encyclopedia Virginia' }]
      }]
    });
    const c = loadCampaign(file);
    expect(c.issue).to.equal(136);
    expect(c.campaigns[0].proposedRulerCode).to.equal('POW');
    fs.unlinkSync(file);
  });

  it('rejects an invalid QID', () => {
    const file = tmpFile({
      issue: 1,
      title: 't',
      campaigns: [{
        type: 'polity',
        name: 'X',
        wikidataQid: 'not-a-qid',
        yearStart: 1500,
        yearEnd: 1600,
        chronasProvinces: ['A'],
        proposedRulerCode: 'XXX'
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/wikidataQid/);
    fs.unlinkSync(file);
  });

  it('forbids chronasProvinces when culture has areaScope=none', () => {
    const file = tmpFile({
      issue: 1,
      title: 't',
      campaigns: [{
        type: 'culture',
        name: 'Clovis',
        wikidataQid: 'Q190888',
        yearStart: -13000,
        yearEnd: -7000,
        chronasKey: 'clovis',
        areaScope: 'none',
        chronasProvinces: ['SomeProvince']
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/chronasProvinces/);
    fs.unlinkSync(file);
  });

  it('rejects a ruler code that is not uppercase alphanumeric', () => {
    const file = tmpFile({
      issue: 1,
      title: 't',
      campaigns: [{
        type: 'polity',
        name: 'X',
        wikidataQid: 'Q1',
        yearStart: 1500,
        yearEnd: 1600,
        chronasProvinces: ['A'],
        proposedRulerCode: 'pow'
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/proposedRulerCode/);
    fs.unlinkSync(file);
  });

  it('rejects a marker with bad coordinates', () => {
    const file = tmpFile({
      issue: 1,
      title: 't',
      campaigns: [{
        type: 'marker',
        name: 'Jamestown',
        markerType: 's',
        year: 1607,
        coo: [-76.78]
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/coo/);
    fs.unlinkSync(file);
  });

  it('loads a valid dimensionFix campaign', () => {
    const file = tmpFile({
      issue: 39,
      title: 'religion fix',
      campaigns: [{
        type: 'dimensionFix',
        name: 'Poland catholic',
        dimension: 'religion',
        value: 'catholic',
        yearStart: 1054,
        yearEnd: 2000,
        chronasProvinces: ['Kalisz', 'Lodz'],
        overwrite: { religion: ['orthodox'] },
        citations: [{ source: 'A' }, { source: 'B' }]
      }]
    });
    const c = loadCampaign(file);
    expect(c.campaigns[0].type).to.equal('dimensionFix');
    expect(c.campaigns[0].dimension).to.equal('religion');
    expect(c.campaigns[0].value).to.equal('catholic');
    fs.unlinkSync(file);
  });

  it('rejects a dimensionFix with fewer than two citations', () => {
    const file = tmpFile({
      issue: 39,
      title: 't',
      campaigns: [{
        type: 'dimensionFix',
        name: 'X',
        dimension: 'religion',
        value: 'catholic',
        yearStart: 1054,
        yearEnd: 2000,
        chronasProvinces: ['Kalisz'],
        overwrite: { religion: ['orthodox'] },
        citations: [{ source: 'A' }]
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/citations/);
    fs.unlinkSync(file);
  });

  it('rejects a dimensionFix without an overwrite allowlist', () => {
    const file = tmpFile({
      issue: 39,
      title: 't',
      campaigns: [{
        type: 'dimensionFix',
        name: 'X',
        dimension: 'religion',
        value: 'catholic',
        yearStart: 1054,
        yearEnd: 2000,
        chronasProvinces: ['Kalisz'],
        citations: [{ source: 'A' }, { source: 'B' }]
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/overwrite/);
    fs.unlinkSync(file);
  });

  it('rejects a dimensionFix targeting an unsupported dimension', () => {
    const file = tmpFile({
      issue: 39,
      title: 't',
      campaigns: [{
        type: 'dimensionFix',
        name: 'X',
        dimension: 'ruler',
        value: 'POL',
        yearStart: 1054,
        yearEnd: 2000,
        chronasProvinces: ['Kalisz'],
        overwrite: { ruler: ['XXX'] },
        citations: [{ source: 'A' }, { source: 'B' }]
      }]
    });
    expect(() => loadCampaign(file)).to.throw(/dimension/);
    fs.unlinkSync(file);
  });

  it('rejects unknown top-level fields', () => {
    const file = tmpFile({
      issue: 1,
      title: 't',
      campaigns: [],
      somethingElse: 1
    });
    expect(() => loadCampaign(file)).to.throw();
    fs.unlinkSync(file);
  });
});
