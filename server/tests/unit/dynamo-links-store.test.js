import { expect } from 'chai';
import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const TABLE = 'chronas-links';

let linksStore;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  linksStore = await import('../../models/dynamo/links-store.js');
});

after(async () => {
  await teardownDynamoLocal();
});

describe('links-store (DynamoDB Local)', () => {
  const SEED = [
    {
      entityRef: '0:Battle_of_Hastings',
      markers: [['London', 'a'], ['Paris', 'b']],
      metadata: [['e_Battle_of_Hastings', 'e']]
    },
    {
      entityRef: '1:e_Battle_of_Hastings',
      markers: [['Battle_of_Hastings', 'a']],
      metadata: []
    },
    {
      entityRef: '0:London',
      markers: [['Battle_of_Hastings', 'a']],
      metadata: []
    },
    {
      entityRef: '0:Paris',
      markers: [['Battle_of_Hastings', 'b']],
      metadata: []
    }
  ];

  beforeEach(async function () {
    this.timeout(10000);
    await clearTable(TABLE);
    await seedTable(TABLE, SEED);
  });

  describe('getLinked()', () => {
    it('returns markers and metadata for existing entity', async () => {
      const result = await linksStore.getLinked('0:Battle_of_Hastings');
      expect(result.markers).to.have.lengthOf(2);
      expect(result.metadata).to.have.lengthOf(1);
      expect(result.markers[0][0]).to.equal('London');
    });

    it('returns empty arrays for non-existent entity', async () => {
      const result = await linksStore.getLinked('0:nonexistent');
      expect(result.markers).to.deep.equal([]);
      expect(result.metadata).to.deep.equal([]);
    });
  });

  describe('batchGetLinked()', () => {
    it('returns linked data for multiple entities', async () => {
      const result = await linksStore.batchGetLinked([
        '0:Battle_of_Hastings', '0:London'
      ]);
      expect(result['0:Battle_of_Hastings'].markers).to.have.lengthOf(2);
      expect(result['0:London'].markers).to.have.lengthOf(1);
    });

    it('returns empty object for empty input', async () => {
      const result = await linksStore.batchGetLinked([]);
      expect(result).to.deep.equal({});
    });
  });

  describe('addLink()', () => {
    it('creates a bidirectional link between two new entities', async () => {
      await linksStore.addLink('0:Rome', '1:e_Roman_Empire', 'a', 'a');

      const rome = await linksStore.getLinked('0:Rome');
      expect(rome.metadata).to.have.lengthOf(1);
      expect(rome.metadata[0][0]).to.equal('e_Roman_Empire');

      const empire = await linksStore.getLinked('1:e_Roman_Empire');
      expect(empire.markers).to.have.lengthOf(1);
      expect(empire.markers[0][0]).to.equal('Rome');
    });

    it('appends to existing links without duplicating', async () => {
      await linksStore.addLink('0:Battle_of_Hastings', '0:Rome', 'a', 'a');

      const battle = await linksStore.getLinked('0:Battle_of_Hastings');
      expect(battle.markers).to.have.lengthOf(3);
      const romeLink = battle.markers.find(m => m[0] === 'Rome');
      expect(romeLink).to.not.be.undefined;

      // Add again — should update type, not duplicate
      await linksStore.addLink('0:Battle_of_Hastings', '0:Rome', 'b', 'b');
      const battle2 = await linksStore.getLinked('0:Battle_of_Hastings');
      expect(battle2.markers).to.have.lengthOf(3);
      const romeLink2 = battle2.markers.find(m => m[0] === 'Rome');
      expect(romeLink2[1]).to.equal('b');
    });
  });

  describe('removeLink()', () => {
    it('removes a bidirectional link', async () => {
      await linksStore.removeLink('0:Battle_of_Hastings', '0:London');

      const battle = await linksStore.getLinked('0:Battle_of_Hastings');
      expect(battle.markers.find(m => m[0] === 'London')).to.be.undefined;
      expect(battle.markers).to.have.lengthOf(1); // Paris remains

      const london = await linksStore.getLinked('0:London');
      expect(london.markers).to.have.lengthOf(0);
    });

    it('deletes the item entirely when all links removed', async () => {
      await linksStore.removeLink('0:London', '0:Battle_of_Hastings');
      const london = await linksStore.getLinked('0:London');
      expect(london.markers).to.deep.equal([]);
      expect(london.metadata).to.deep.equal([]);
    });
  });

  describe('renameEntity()', () => {
    it('renames an entity and updates all references', async () => {
      await linksStore.renameEntity('0:Battle_of_Hastings', '0:Hastings_1066');

      // Old ref should be gone
      const old = await linksStore.getLinked('0:Battle_of_Hastings');
      expect(old.markers).to.deep.equal([]);

      // New ref has the same links
      const renamed = await linksStore.getLinked('0:Hastings_1066');
      expect(renamed.markers).to.have.lengthOf(2);
      expect(renamed.metadata).to.have.lengthOf(1);

      // Linked entities now reference the new name
      const london = await linksStore.getLinked('0:London');
      expect(london.markers[0][0]).to.equal('Hastings_1066');

      const paris = await linksStore.getLinked('0:Paris');
      expect(paris.markers[0][0]).to.equal('Hastings_1066');

      const event = await linksStore.getLinked('1:e_Battle_of_Hastings');
      expect(event.markers[0][0]).to.equal('Hastings_1066');
    });
  });
});
