import { each as asyncEach } from 'async';
import mongoose from 'mongoose';

import Marker from '../../../models/marker.model.js';


// models
import Discussion from '../discussion/model.js';


// controllers
import opinionController from '../opinion/controller.js';
import userController from '../user/controller.js';

import Forum from './model.js';
const { getAllOpinions } = opinionController;
const { getUser } = userController;

/**
 * get all forums list
 * @type {Promise}
 */
const getAllForums = async () => {
  try {
    const results = await Forum.find({}).exec();
    return results || [];
  } catch (error) {
    console.log(error);
    throw error;
  }
};

/**
 * get discussions of a forum
 * @param  {ObjectId} forum_slug
 * @param  {Boolean} pinned
 * @return {Promise}
 */
const getDiscussions = async (forum_slug, pinned, sorting_method = 'date', qEntity = false, offset = 0, limit = 10) => {
  try {
    // define sorting method
    const sortWith = {};
    if (sorting_method === 'date') sortWith.date = -1;
    if (sorting_method === 'popularity') sortWith.favorites = -1;

    const forumFound = await Forum.findOne({ forum_slug }).exec();

    const searchObj = { pinned };
    if (qEntity) {
      searchObj.qa_id = qEntity;
    } else {
      searchObj.forum_id = (forumFound || {})._id;
    }

    const [discussions, discussionCount] = await Promise.all([
      Discussion
        .find(searchObj)
        .sort(sortWith)
        .populate('forum')
        .populate('user')
        .lean()
        .skip(+offset)
        .limit(+limit)
        .exec(),
      Discussion.countDocuments(searchObj).exec()
    ]);

    if (!discussions) {
      return [[], 0];
    }

    // Attach opinion count to each discussion
    const discussionsWithOpinions = await Promise.all(
      discussions.map(async (discussion) => {
        try {
          const opinions = await getAllOpinions(discussion._id);
          discussion.opinion_count = opinions ? opinions.length : 0;
          return discussion;
        } catch (error) {
          console.error('Error getting opinions for discussion:', error);
          discussion.opinion_count = 0;
          return discussion;
        }
      })
    );

    return [discussionsWithOpinions, discussionCount];
  } catch (error) {
    console.error('Error in getDiscussions:', error);
    throw error;
  }
};

export default {
  getAllForums,
  getDiscussions
};
