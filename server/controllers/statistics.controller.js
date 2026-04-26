import Marker from '../models/marker.model.js';
import Metadata from '../models/metadata.model.js';
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import Discussion from '../boardComponent/entities/discussion/model.js';
import Opinion from '../boardComponent/entities/opinion/model.js';

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
let cachedResult = null;
let cachedAt = 0;

function list(req, res, next) {
  const now = Date.now();
  if (cachedResult && (now - cachedAt) < CACHE_TTL_MS) {
    return res.json(cachedResult);
  }

  buildStatistics()
    .then((stats) => {
      cachedResult = stats;
      cachedAt = Date.now();
      res.json(stats);
    })
    .catch(e => next(e));
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

export default { list };
