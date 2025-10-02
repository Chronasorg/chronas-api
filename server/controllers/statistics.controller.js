import Marker from '../models/marker.model.js';
import Metadata from '../models/metadata.model.js';
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import Discussion from '../boardComponent/entities/discussion/model.js';
import Opinion from '../boardComponent/entities/opinion/model.js';


/**
 * Get marker list.
 * @property {number} req.query.offe - Number of markers to be skipped.
 * @property {number} req.query.limit - Limit number of markers to be returned.
 * @returns {Marker[]}
 */
function list(req, res, next) {
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
  Opinion.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }])
    .exec()
    .then((commentsBreakDown) => {
      statisticsObj.comments = commentsBreakDown;
      statisticsObj.commentsTotal = commentsBreakDown.reduce((a, el) => a + el.count, 0);
      Discussion.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }])
        .exec()
        .then((threadsBreakDown) => {
          statisticsObj.threads = threadsBreakDown;
          statisticsObj.threadsTotal = threadsBreakDown.reduce((a, el) => a + el.count, 0);
          User.aggregate([{ $group: { _id: '$authType', count: { $sum: 1 } } }])
            .exec()
            .then((userBreakDown) => {
              statisticsObj.user = userBreakDown;
              statisticsObj.userTotal = userBreakDown.reduce((a, el) => a + el.count, 0);
              Revision.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }])
                .exec()
                .then((revisionrBreakDown) => {
                  statisticsObj.revision = revisionrBreakDown;
                  statisticsObj.revisionTotal = revisionrBreakDown.reduce((a, el) => a + el.count, 0);
                  Marker.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }])
                    .exec()
                    .then((markerBreakDown) => {
                      statisticsObj.marker = markerBreakDown;
                      statisticsObj.markerTotal = markerBreakDown.reduce((a, el) => a + el.count, 0);
                      Metadata.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }])
                        .exec()
                        .then((metadataBreakDown) => {
                          statisticsObj.metadata = metadataBreakDown;
                          statisticsObj.metadataTotal = metadataBreakDown.reduce((a, el) => a + el.count, 0);
                          Metadata.aggregate([{ $group: { _id: '$subtype', count: { $sum: 1 } } }])
                            .exec()
                            .then((metadataIBreakDown) => {
                              statisticsObj.metadataI = metadataIBreakDown;
                              Metadata.find({ _id: { $in: entityMetadatas } })
                                .lean()
                                .exec()
                                .then((entityMetadatasObj) => {
                                  let entitySum = 0;
                                  entityMetadatasObj.forEach(o => entitySum += Object.keys(o.data).length);
                                  statisticsObj.metadataEntityCount = entitySum;
                                  res.json(statisticsObj);
                                })
                                .catch(e => next(e));
                            })
                            .catch(e => next(e));
                        })
                        .catch(e => next(e));
                    })
                    .catch(e => next(e));
                })
                .catch(e => next(e));
            })
            .catch(e => next(e));
        })
        .catch(e => next(e));
    })
    .catch(e => next(e));
}


export default { list };
