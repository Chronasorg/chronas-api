// models
import userCtrl from "../../../controllers/user.controller";

const Opinion = require('./model');

/**
 * get all opinion regarding a single discussion
 * @param  {ObjectId} discussion_id
 * @return {Promise}
 */
const getAllOpinions = (discussion_id) => {
  return new Promise((resolve, reject) => {
    Opinion
    .find({ discussion_id })
    .populate('user')
    .sort({ date: -1 })
    .exec((error, opinions) => {
      if (error) { console.log(error); reject(error); }
      else if (!opinions) reject(null);
      else resolve(opinions);
    });
  });
};

/**
 * create an opinion regarding a discussion
 * @param  {ObjectId} forum_slug
 * @param  {ObjectId} discussion_id
 * @param  {ObjectId} user_id
 * @param  {Object} content
 * @return {Promise}
 */
const createOpinion = ({ forum_id, discussion_id, user_id, content }) => {
  return new Promise((resolve, reject) => {
    const newOpinion = new Opinion({
      forum_id,
      discussion_id,
      discussion: discussion_id,
      user_id,
      user: user_id,
      content,
      date: new Date(),
    });

    newOpinion.save((error) => {
      if (error) { console.log(error); reject(error); }
      else { resolve(newOpinion); }
    });
  });
};

const updateOpinion = (opinion_id) => {
  // TODO: implement update for opinion
};

/**
 * delete a single opinion
 * @param  {ObjectId} opinion_id
 * @return {Promise}
 */
const deleteOpinion = (opinion_id) => {
  return new Promise((resolve, reject) => {
    Opinion
    .remove({ _id: opinion_id })
    .exec((error) => {
      if (error) { console.log(error); reject(error); }
      else resolve('deleted');
    });
  });
};

const voteOpinion = (req, res, opinion_id, delta = 0) => {
  return new Promise((resolve, reject) => {
    const username = (req.auth || {}).username
    Opinion
      .findOne({ _id: opinion_id })
      .exec()
      .then((opinion) => {
        if (username === opinion.user) {
          reject('Cannot vote on own opinion.')
        }
        opinion.score += delta
        opinion.save()
          .then((savedOpinion) => {
            if (username) userCtrl.changePoints(username, 'voted', 1)
            resolve(savedOpinion)
          })
          .catch(e => reject(e))
      })
      .catch(e => reject(e))
  });
};

module.exports = {
  getAllOpinions,
  createOpinion,
  updateOpinion,
  voteOpinion,
  deleteOpinion,
};
