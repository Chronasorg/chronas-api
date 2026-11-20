import { expect } from 'chai';
import {
  buildNameHistory, nameInYear, officialNames, titleName, transliterateRu
} from '../../../scripts/data-validation/city-name-history.js';

const st = (lang, text, start = null, end = null) => ({ lang, text, start, end });

describe('city name history (frontend #69)', () => {
  it('uses English names with their periods (Volgograd)', () => {
    const marker = { _id: 'Volgograd', name: 'Tsaritsyn', coo: [44.5, 48.7] };
    const names = buildNameHistory(marker, [
      st('ru', 'Царицын', 1589, 1925), st('ru', 'Сталинград', 1925, 1961), st('ru', 'Волгоград', 1961),
      st('en', 'Tsaritsyn', 1589, 1925), st('en', 'Stalingrad', 1925, 1961), st('en', 'Volgograd', 1961),
      st('hu', 'Sztálingrád', 1925, 1961)
    ]);
    expect(names).to.deep.equal([[1589, 1925, 'Tsaritsyn'], [1925, 1961, 'Stalingrad'], [1961, null, 'Volgograd']]);
    expect(nameInYear({ ...marker, names }, 1942)).to.equal('Stalingrad');
    expect(nameInYear({ ...marker, names }, 1961)).to.equal('Volgograd');
    expect(nameInYear({ ...marker, names }, 1500)).to.equal('Tsaritsyn');
  });

  it('names a period with the English title when it matches today\'s own-language name (Saint Petersburg)', () => {
    const names = buildNameHistory({ _id: 'Saint_Petersburg', name: 'Saint Petersburg', coo: [30.3, 59.9] }, [
      st('ru', 'Санкт-Петербург', 1991), st('ru', 'Ленинград', 1924, 1991), st('ru', 'Петроград', 1914, 1924),
      st('ru', 'Санкт-Петербург', 1703, 1914), st('de', 'Petrograd', 1914, 1924), st('az', 'Leninqrad', 1924, 1991)
    ]);
    expect(names).to.deep.equal([
      [1703, 1914, 'Saint Petersburg'], [1914, 1924, 'Petrograd'], [1924, 1991, 'Leningrad'], [1991, null, 'Saint Petersburg']
    ]);
  });

  it('prefers German over Russian, and drops overlapping worse periods (Kaliningrad)', () => {
    const names = buildNameHistory({ _id: 'Kaliningrad', name: 'Kaliningrad', coo: [20.5, 54.7] }, [
      st('de', 'Königsberg', 1255, 1946), st('ru', 'Калининград', 1946), st('ru', 'Кёнигсберг', 1255, 1946),
      st('be', 'Твангстэ', null, 1255)
    ]);
    expect(names).to.deep.equal([[1255, 1946, 'Königsberg'], [1946, null, 'Kaliningrad']]);
  });

  it('transliterates Russian only for Cyrillic cities in Eastern Europe or northern Asia', () => {
    const statements = [st('ru', 'Свердловск', 1924, 1991), st('ru', 'Екатеринбург', 1991)];
    expect(buildNameHistory({ _id: 'Yekaterinburg', name: 'Yekaterinburg', coo: [60.6, 56.8] }, statements))
      .to.deep.equal([[1924, 1991, 'Sverdlovsk'], [1991, null, 'Yekaterinburg']]);
    expect(buildNameHistory({ _id: 'Kisangani', name: 'Kisangani', coo: [25.2, 0.5] }, [
      st('ru', 'Стенливиль', null, 1966), st('ru', 'Кисангани', 1966)
    ])).to.equal(null);
  });

  it('ignores institutions, undated statements and histories that change nothing', () => {
    expect(buildNameHistory({ _id: 'Leipzig_University', name: 'Leipzig University' }, [st('de', 'Karl-Marx-Universität', 1953, 1991)])).to.equal(null);
    expect(buildNameHistory({ _id: 'York', name: 'York' }, [st('en', 'York')])).to.equal(null);
    expect(buildNameHistory({ _id: 'Calgary', name: 'Calgary' }, [st('en', 'Town of Calgary', 1884, 1894), st('en', 'City of Calgary', 1894)])).to.equal(null);
  });

  it('fills gaps with the name before them and ends with the English title (Lviv)', () => {
    const names = buildNameHistory({ _id: 'Lviv', name: 'Lviv', coo: [24, 49.8] }, [
      st('pl', 'Lwów', 1340, 1773), st('de', 'Lemberg', 1773, 1918), st('pl', 'Lwów', 1918, 1946), st('uk', 'Львів')
    ]);
    expect(names).to.deep.equal([[1340, 1773, 'Lwów'], [1773, 1918, 'Lemberg'], [1918, 1946, 'Lwów'], [1946, null, 'Lviv']]);
  });

  it('reads P1448 statements with their qualifier years', () => {
    const entity = { claims: { P1448: [{ rank: 'normal', mainsnak: { datavalue: { value: { language: 'en', text: 'Stalingrad' } } }, qualifiers: { P580: [{ datavalue: { value: { time: '+1925-04-10T00:00:00Z' } } }], P582: [{ datavalue: { value: { time: '+1961-00-00T00:00:00Z' } } }] } }, { rank: 'deprecated', mainsnak: { datavalue: { value: { language: 'en', text: 'x' } } } }] } };
    expect(officialNames(entity)).to.deep.equal([{ lang: 'en', text: 'Stalingrad', start: 1925, end: 1961 }]);
  });

  it('cleans article titles and transliterates Russian', () => {
    expect(titleName('Abilene,_Texas')).to.equal('Abilene');
    expect(titleName('Mocha_(city)')).to.equal('Mocha');
    expect(transliterateRu('Горький')).to.equal('Gorky');
    expect(transliterateRu('Екатеринбург')).to.equal('Yekaterinburg');
    expect(transliterateRu('Целиноград')).to.equal('Tselinograd');
  });
});
