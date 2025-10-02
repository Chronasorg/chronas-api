import _ from 'lodash'
import { each as asyncEach } from 'async'

// controllers
import opinionController from '../opinion/controller.js'
const { getAllOpinions } = opinionController

// models
// import User from './model.js';
import User from '../../../models/user.model.js'
import Discussion from '../discussion/model.js'
import Opinion from '../opinion/model.js'

/**
 * get user doc by user id
 * @param  {ObjectId} user_id
 * @return {promise}
 */
const getUser = async (user_id) => {
  try {
    const user = await User.findOne({ _id: user_id });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  } catch (error) {
    console.log(error);
    throw error;
  }
}


/**
 * get the full profile of a user
 * @param  {String} username
 * @return {Promise}
 */
const getFullProfile = async (username) => {
  try {
    const foundUser = await User.findOne({ username }).lean().exec();
    
    if (!foundUser) {
      throw new Error('not_found');
    }

    // Get opinions by the user
    try {
      const opinions = await Opinion
        .find({ user_id: foundUser._id || foundUser.id })
        .limit(10)
        .populate('discussion')
        .exec();
      foundUser.opinions = opinions;
    } catch (error) {
      console.log(error);
      foundUser.opinions = [];
    }

    // Get discussions by the user
    const discussions = await Discussion
      .find({ user_id: foundUser._id || foundUser.id })
      .limit(10)
      .populate('forum')
      .lean()
      .exec();

    // Add opinion count to each discussion
    const discussionsWithOpinionCount = await Promise.all(
      discussions.map(async (discussion) => {
        try {
          const opinions = await getAllOpinions(discussion._id);
          discussion.opinion_count = opinions ? opinions.length : 0;
          return discussion;
        } catch (error) {
          console.error(error);
          discussion.opinion_count = 0;
          return discussion;
        }
      })
    );

    foundUser.discussions = discussionsWithOpinionCount;
    return foundUser;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export default {
  getUser,
  getFullProfile,
}
