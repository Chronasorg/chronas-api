import { expect } from 'chai';

import { findDuplicateKeys, validateMappingsFile } from '../../../../scripts/data-validation/mappings-validator.js';

describe('mappings-validator', () => {
  it('detects a duplicate key inside an exported object literal', () => {
    const src = `
      export const religionFromWikidata = {
        'Q1': 'a',
        'Q2': 'b',
        'Q1': 'c'
      };
    `;
    const v = findDuplicateKeys(src);
    expect(v.length).to.equal(1);
    expect(v[0].key).to.equal('Q1');
    expect(v[0].exportName).to.equal('religionFromWikidata');
  });

  it('finds zero duplicates in a clean source', () => {
    const src = `
      export const x = { 'Q1': 'a', 'Q2': 'b' };
      export const y = { 'Q1': 'a' };
    `;
    expect(findDuplicateKeys(src)).to.deep.equal([]);
  });

  it('handles substring overlap correctly (Q748 vs Q748396)', () => {
    const src = `
      export const r = {
        'Q748':    'sunni',
        'Q748396': 'animism'
      };
    `;
    expect(findDuplicateKeys(src)).to.deep.equal([]);
  });

  it('passes for the real wikidata-mappings.js (regression — file is currently clean)', () => {
    expect(() => validateMappingsFile()).to.not.throw();
  });
});
