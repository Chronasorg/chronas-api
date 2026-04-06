import mongoose from 'mongoose';
import { waterfall } from 'async';

// models
import Discussion from '../discussion/model.js';
import Opinion from '../opinion/model.js';
import Forum from '../forum/model.js';
import User from '../user/model.js';

/**
 * get the information for admin dashboard
 * @return {Promise}
 */
const getAdminDashInfo = async () => {
  try {
    const discussionCount = await Discussion.countDocuments().exec();
    const opinionCount = await Opinion.countDocuments().exec();
    const forumCount = await Forum.countDocuments().exec();
    const userCount = await User.countDocuments().exec();
    const forums = await Forum
      .find({})
      .sort({ date: -1 })
      .lean()
      .exec();

    return {
      discussionCount,
      opinionCount,
      forumCount,
      userCount,
      forums
    };
  } catch (error) {
    console.log(error);
    throw error;
  }
};

/**
 * create a new forum
 * @param  {String} forum_name
 * @param  {String} forum_slug
 * @return {Promise}
 */
const createForum = ({ forum_name, forum_slug }) => new Promise((resolve, reject) => {
  // check if the forum exists
  Forum
    .findOne({ forum_slug })
    .exec()
    .then(forum => {
      if (forum) {
        reject({ alreadyExists: true });
      } else {
        // forum does not exists, so create a new one
        const forumObj = {
          forum_slug,
          forum_name
        };

        // if (forum_slug === 'questions') {
        //   forumObj._id = forum_slug
        // }

        const newForum = new Forum(forumObj);

        newForum.save()
          .then(() => {
            resolve(Object.assign({}, newForum, { created: true }));
          })
          .catch(error => {
            console.log(error);
            reject({ created: false });
          });
      }
    })
    .catch(error => {
      console.log(error);
      reject({ serverError: true });
    });
});

/**
 * delete an entire forum
 * @param  {String} forum_id
 * @return {Promise}
 */
const deleteForum = ({ forum_id }) => new Promise((resolve, reject) => {
  // first remove any discussion regarding the forum
  Discussion.deleteMany({ forum_id }).exec()
    .then(() => {
      // remove any opinion regarding the forum
      return Opinion.deleteMany({ forum_id }).exec()
        .then(() => {
          // now we can remove the forum
          return Forum.deleteOne({ _id: forum_id }).exec()
            .then(() => {
              resolve({ deleted: true });
            });
        });
    })
    .catch(error => {
      console.log(error);
      reject({ deleted: false });
    });
});

/**
 * delete an user
 * @param  {String} user_id
 * @return {Promise}
 */
const deleteUser = ({ user_id }) => new Promise((resolve, reject) => {
  // first we need to remvoe any discussion the user created
  Discussion.deleteMany({ user_id }).exec()
    .then(() => {
      // now we need to remove any opinions that are created by the user
      return Opinion.deleteMany({ user_id }).exec()
        .then(() => {
          // finally we can remove the user
          return User.deleteOne({ _id: user_id }).exec()
            .then(() => {
              resolve({ deleted: true });
            });
        });
    })
    .catch(error => {
      console.log(error);
      reject({ deleted: false });
    });
});

/**
 * delete a single discussion
 * @param  {String} discussion_id
 * @return {Promise}
 */
const deleteDiscussion = ({ discussion_id }) => new Promise((resolve, reject) => {
  // first we need to remove any opinion regarding the discussion
  Opinion.deleteMany({ discussion_id }).exec()
    .then(() => {
      // now we need to remove the discussion
      return Discussion.deleteOne({ _id: discussion_id }).exec()
        .then(() => {
          resolve({ deleted: true });
        });
    })
    .catch(error => {
      console.log(error);
      reject({ deleted: false });
    });
});

export default {
  getAdminDashInfo,
  createForum,
  deleteForum,
  deleteUser,
  deleteDiscussion
};
