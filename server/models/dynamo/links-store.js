import { GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

import { getDocClient, tableName } from './dynamo-client.js';

/**
 * Per-entity links store — replaces the monolithic `Metadata._id='links'`
 * singleton document.
 *
 * Item shape:
 *   PK: entityRef (S)   — "0:<markerId>" or "1:<metadataId>"
 *   markers (L)         — [[linkedEntityRef, weight], ...]
 *   metadata (L)        — [[linkedEntityRef, weight], ...]
 *
 * Controllers that previously did `Metadata.get('links').then(links => ...mutate whole doc...)`
 * now call these helpers to touch only the affected entities. This is
 * implemented in Phase 4b per the migration plan — the module is scaffolded
 * now so the shape is visible to reviewers. Each method throws until
 * implemented; no silent no-ops.
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

export async function addLink(/* sourceRef, targetRef, weight */) {
  throw new Error('links-store.addLink: not implemented yet — Phase 4b');
}

export async function removeLink(/* sourceRef, targetRef */) {
  throw new Error('links-store.removeLink: not implemented yet — Phase 4b');
}

export async function renameEntity(/* oldRef, newRef */) {
  throw new Error('links-store.renameEntity: not implemented yet — Phase 4b');
}
