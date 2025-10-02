// models
import userCtrl from '../../../controllers/user.controller.js';
import contactCtrl from '../../../controllers/contact.controller.js';

import Opinion from './model.js';

/**
 * get all opinion regarding a single discussion
 * @param  {ObjectId} discussion_id
 * @return {Promise}
 */
const getAllOpinions = async (discussion_id) => {
  try {
    const opinions = await Opinion
      .find({ discussion_id })
      .populate('user')
      .sort({ date: -1 })
      .exec();

    return opinions || [];
  } catch (error) {
    console.log(error);
    throw error;
  }
};

/**
 * create an opinion regarding a discussion
 * @param  {ObjectId} forum_slug
 * @param  {ObjectId} discussion_id
 * @param  {ObjectId} user_id
 * @param  {Object} content
 * @return {Promise}
 */
const createOpinion = async ({ forum_id, discussion_id, user_id, content }, req, res) => {
  try {
    const newOpinion = new Opinion({
      forum_id,
      discussion_id,
      discussion: discussion_id,
      user_id,
      user: user_id,
      content,
      date: new Date()
    });

    const savedOpinion = await newOpinion.save();

    req.body = {
      subject: 'Chronas: New Comment added',
      from: 'noreply@chronas.org',
      html: `Full payload: ${JSON.stringify({
        forum_id,
        discussion_id,
        discussion: discussion_id,
        user_id,
        user: user_id,
        content,
        date: new Date()
      }, undefined, '<br />')}`
    };

    contactCtrl.create(req, res, false);
    return savedOpinion;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const updateOpinion = (opinion_id) => {
  // TODO: implement update for opinion
};

/**
 * delete a single opinion
 * @param  {ObjectId} opinion_id
 * @return {Promise}
 */
const deleteOpinion = async (opinion_id) => {
  try {
    await Opinion.deleteOne({ _id: opinion_id });
    return 'deleted';
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const voteOpinion = (req, res, opinion_id, delta = 0) => new Promise((resolve, reject) => {
  const { username } = req.auth || {};
  Opinion
    .findOne({ _id: opinion_id })
    .exec()
    .then((opinion) => {
      if (username === opinion.user) {
        reject('Cannot vote on own opinion.');
      }
      opinion.score += delta;
      opinion.save()
        .then((savedOpinion) => {
          if (username) userCtrl.changePoints(username, 'voted', 1);
          resolve(savedOpinion);
        })
        .catch(e => reject(e));
    })
    .catch(e => reject(e));
});

export default {
  getAllOpinions,
  createOpinion,
  updateOpinion,
  voteOpinion,
  deleteOpinion
};
