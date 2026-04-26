import { GetCommand, PutCommand, BatchGetCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

import { getDocClient, tableName } from './dynamo-client.js';

/**
 * Per-entity links store — replaces the monolithic `Metadata._id='links'`
 * singleton document.
 *
 * Item shape:
 *   PK: entityRef (S)   — "0:<markerId>" or "1:<metadataId>"
 *   markers (L)         — [[linkedEntityId, linkType], ...]
 *   metadata (L)        — [[linkedEntityId, linkType], ...]
 *
 * "markers" slot = index 0 in the old links.data[ref] array
 * "metadata" slot = index 1 in the old links.data[ref] array
 */

export const LINKS_TABLE = tableName('links');

export async function getLinked(entityRef) {
  const { Item } = await getDocClient().send(new GetCommand({
    TableName: LINKS_TABLE,
    Key: { entityRef }
  }));
  if (!Item) return { markers: [], metadata: [] };
  return {
    markers: Item.markers || [],
    metadata: Item.metadata || []
  };
}

export async function batchGetLinked(entityRefs) {
  if (!entityRefs || entityRefs.length === 0) return {};
  const chunks = [];
  for (let i = 0; i < entityRefs.length; i += 100) {
    chunks.push(entityRefs.slice(i, i + 100));
  }
  const out = {};
  for (const chunk of chunks) {
    const { Responses } = await getDocClient().send(new BatchGetCommand({
      RequestItems: {
        [LINKS_TABLE]: {
          Keys: chunk.map(entityRef => ({ entityRef }))
        }
      }
    }));
    const items = (Responses && Responses[LINKS_TABLE]) || [];
    for (const item of items) {
      out[item.entityRef] = {
        markers: item.markers || [],
        metadata: item.metadata || []
      };
    }
  }
  return out;
}

/**
 * Add a bidirectional link between sourceRef and targetRef.
 * @param {string} sourceRef — e.g. "0:Battle_of_Hastings"
 * @param {string} targetRef — e.g. "1:e_Battle_of_Hastings"
 * @param {string} sourceType — link type for source→target (e.g. "a", "e", "b")
 * @param {string} targetType — link type for target→source
 */
export async function addLink(sourceRef, targetRef, sourceType, targetType) {
  const sourceSlot = targetRef.startsWith('0:') ? 'markers' : 'metadata';
  const targetSlot = sourceRef.startsWith('0:') ? 'markers' : 'metadata';

  const sourceId = targetRef.substring(2);
  const targetId = sourceRef.substring(2);

  await upsertLink(sourceRef, sourceSlot, sourceId, sourceType);
  await upsertLink(targetRef, targetSlot, targetId, targetType);
}

/**
 * Remove a bidirectional link between sourceRef and targetRef.
 */
export async function removeLink(sourceRef, targetRef) {
  const sourceSlot = targetRef.startsWith('0:') ? 'markers' : 'metadata';
  const targetSlot = sourceRef.startsWith('0:') ? 'markers' : 'metadata';

  const sourceId = targetRef.substring(2);
  const targetId = sourceRef.substring(2);

  await removeLinkEntry(sourceRef, sourceSlot, sourceId);
  await removeLinkEntry(targetRef, targetSlot, targetId);
}

/**
 * Rename all references from oldRef to newRef across the entire links table.
 * Used when a marker's wiki (and therefore _id) changes.
 */
export async function renameEntity(oldRef, newRef) {
  const client = getDocClient();
  const oldLinks = await getLinked(oldRef);

  const allRefs = [
    ...oldLinks.markers.map(([id]) => `0:${id}`),
    ...oldLinks.metadata.map(([id]) => `1:${id}`)
  ];

  for (const ref of allRefs) {
    const item = await getRawItem(ref);
    if (!item) continue;
    let dirty = false;
    for (const slot of ['markers', 'metadata']) {
      if (!item[slot]) continue;
      for (let i = 0; i < item[slot].length; i++) {
        const oldId = oldRef.substring(2);
        const newId = newRef.substring(2);
        if (item[slot][i][0] === oldId) {
          item[slot][i] = [newId, item[slot][i][1]];
          dirty = true;
        }
      }
    }
    if (dirty) {
      await client.send(new PutCommand({ TableName: LINKS_TABLE, Item: item }));
    }
  }

  // Move the old entity's link item to the new key — put first, delete only on success
  if (oldLinks.markers.length > 0 || oldLinks.metadata.length > 0) {
    await client.send(new PutCommand({
      TableName: LINKS_TABLE,
      Item: { entityRef: newRef, markers: oldLinks.markers, metadata: oldLinks.metadata }
    }));
    await client.send(new DeleteCommand({
      TableName: LINKS_TABLE,
      Key: { entityRef: oldRef }
    }));
  } else {
    await client.send(new DeleteCommand({
      TableName: LINKS_TABLE,
      Key: { entityRef: oldRef }
    }));
  }
}

async function getRawItem(entityRef) {
  const { Item } = await getDocClient().send(new GetCommand({
    TableName: LINKS_TABLE,
    Key: { entityRef }
  }));
  return Item || null;
}

async function upsertLink(entityRef, slot, linkedId, linkType) {
  const client = getDocClient();
  const existing = await getRawItem(entityRef);
  const item = existing || { entityRef, markers: [], metadata: [] };

  if (!item[slot]) item[slot] = [];
  const idx = item[slot].findIndex(el => el[0] === linkedId);
  if (idx === -1) {
    item[slot].push([linkedId, linkType]);
  } else {
    item[slot][idx] = [linkedId, linkType];
  }

  await client.send(new PutCommand({ TableName: LINKS_TABLE, Item: item }));
}

async function removeLinkEntry(entityRef, slot, linkedId) {
  const client = getDocClient();
  const existing = await getRawItem(entityRef);
  if (!existing || !existing[slot]) return;

  existing[slot] = existing[slot].filter(el => el[0] !== linkedId);

  if (existing.markers.length === 0 && existing.metadata.length === 0) {
    await client.send(new DeleteCommand({
      TableName: LINKS_TABLE,
      Key: { entityRef }
    }));
  } else {
    await client.send(new PutCommand({ TableName: LINKS_TABLE, Item: existing }));
  }
}
