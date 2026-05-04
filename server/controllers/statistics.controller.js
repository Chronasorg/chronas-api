import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';

import Marker from '../models/marker.model.js';
import Metadata from '../models/metadata.model.js';
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import Discussion from '../boardComponent/entities/discussion/model.js';
import Opinion from '../boardComponent/entities/opinion/model.js';

const S3_BUCKET = process.env.STATISTICS_S3_BUCKET || 'chronas-csv';
const S3_KEY = process.env.STATISTICS_S3_KEY || 'api/statistics.json';
const REGION = process.env.AWS_REGION || process.env.region || 'eu-west-1';

let s3Client = null;
function getS3() {
  if (!s3Client) s3Client = new S3Client({ region: REGION });
  return s3Client;
}

let memoryCache = null;
let memoryCacheAt = 0;
const MEMORY_TTL = 1000 * 60 * 60; // 1 hour in-memory cache

function list(req, res, next) {
  const now = Date.now();
  if (memoryCache && (now - memoryCacheAt) < MEMORY_TTL) {
    return res.json(memoryCache);
  }

  readFromS3()
    .then((stats) => {
      if (stats) {
        memoryCache = stats;
        memoryCacheAt = Date.now();
        return res.json(stats);
      }
      res.status(503).json({ error: 'Statistics not yet computed. POST /v1/statistics/refresh to generate.' });
    })
    .catch((err) => {
      console.error('Statistics S3 read error:', err.name, err.message, 'Bucket:', S3_BUCKET, 'Key:', S3_KEY);
      res.status(503).json({ error: `Statistics unavailable: ${err.name}: ${err.message}`, bucket: S3_BUCKET, key: S3_KEY });
    });
}

async function refresh(req, res) {
  try {
    const stats = await buildAndStore();
    res.json({ refreshed: true, markerTotal: stats.markerTotal, updatedAt: stats._updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function readFromS3() {
  try {
    const response = await getS3().send(new GetObjectCommand({
      Bucket: S3_BUCKET, Key: S3_KEY
    }));
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') return null;
    throw err;
  }
}

async function buildAndStore() {
  const stats = await buildStatistics();
  stats._updatedAt = new Date().toISOString();

  await getS3().send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: S3_KEY,
    Body: JSON.stringify(stats),
    ContentType: 'application/json'
  }));

  memoryCache = stats;
  memoryCacheAt = Date.now();
  return stats;
}

async function buildStatistics() {
  const statisticsObj = {
    area: { provinces: 2479, areaDatapoints: 49580000 },
    marker: {},
    revision: {},
    user: {},
    threads: {},
    comments: {},
    metadata: {}
  };

  const entityMetadatas = ['ruler', 'culture', 'religion', 'religionGeneral'];

  const [
    commentsBreakDown,
    threadsBreakDown,
    userBreakDown,
    revisionBreakDown,
    markerBreakDown,
    metadataBreakDown,
    metadataIBreakDown,
    entityMetadatasObj
  ] = await Promise.all([
    Opinion.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec(),
    Discussion.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec(),
    User.aggregate([{ $group: { _id: '$authType', count: { $sum: 1 } } }]).exec(),
    Revision.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
    Marker.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
    Metadata.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
    Metadata.aggregate([{ $group: { _id: '$subtype', count: { $sum: 1 } } }]).exec(),
    Metadata.find({ _id: { $in: entityMetadatas } }).lean().exec()
  ]);

  statisticsObj.comments = commentsBreakDown;
  statisticsObj.commentsTotal = commentsBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.threads = threadsBreakDown;
  statisticsObj.threadsTotal = threadsBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.user = userBreakDown;
  statisticsObj.userTotal = userBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.revision = revisionBreakDown;
  statisticsObj.revisionTotal = revisionBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.marker = markerBreakDown;
  statisticsObj.markerTotal = markerBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.metadata = metadataBreakDown;
  statisticsObj.metadataTotal = metadataBreakDown.reduce((a, el) => a + el.count, 0);
  statisticsObj.metadataI = metadataIBreakDown;

  let entitySum = 0;
  entityMetadatasObj.forEach(o => {
    if (o.data && typeof o.data === 'object') entitySum += Object.keys(o.data).length;
  });
  statisticsObj.metadataEntityCount = entitySum;

  return statisticsObj;
}

export default { list, refresh, buildAndStore };
