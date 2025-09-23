import mongoose from 'mongoose'

import { waterfall as waterfall } from 'async'

// models
import Discussion from '../discussion/model.js'
import Opinion from '../opinion/model.js'
import Forum from '../forum/model.js'
import User from '../user/model.js'

/**
 * get the information for admin dashboard
 * @return {Promise}
 */
const getAdminDashInfo = () => new Promise((resolve, reject) => {
  waterfall([
    (callback) => {
      Discussion.count().exec((error, count) => {
        callback(null, { discussionCount: count })
      })
    },
    (lastResult, callback) => {
      Opinion.count().exec((error, count) => {
        callback(null, Object.assign(lastResult, { opinionCount: count }))
      })
    },
    (lastResult, callback) => {
      Forum.count().exec((error, count) => {
        callback(null, Object.assign(lastResult, { forumCount: count }))
      })
    },
    (lastResult, callback) => {
      User.count().exec((error, count) => {
        callback(null, Object.assign(lastResult, { userCount: count }))
      })
    },
    (lastResult, callback) => {
      Forum
        .find({})
        .sort({ date: -1 })
        .lean()
        .exec((error, forums) => {
          callback(null, Object.assign(lastResult, { forums }))
        })
    },
  ], (error, result) => {
    if (error) { console.log(error); reject(error) } else resolve(result)
  })
})

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
    .exec((error, forum) => {
      if (error) { console.log(error); reject({ serverError: true }) } else if (forum) { reject({ alreadyExists: true }) } else {
        // forum does not exists, so create a new one
        const forumObj = {
          forum_slug,
          forum_name,
        }

        // if (forum_slug === 'questions') {
        //   forumObj._id = forum_slug
        // }

        const newForum = new Forum(forumObj)

        newForum.save((error) => {
          if (error) { console.log(error); reject({ created: false }) } else { resolve(Object.assign({}, newForum, { created: true })) }
        })
      }
    })
})

/**
 * delete an entire forum
 * @param  {String} forum_id
 * @return {Promise}
 */
const deleteForum = ({ forum_id }) => new Promise((resolve, reject) => {
    // first remove any discussion regarding the forum
  Discussion.remove({ forum_id }).exec((error) => {
    if (error) { console.log(error); reject({ deleted: false }) } else {
        // remove any opinion regarding the forum
      Opinion.remove({ forum_id }).exec((error) => {
        if (error) { console.log(error); reject({ deleted: false }) } else {
            // now we can remove the forum
          Forum.remove({ _id: forum_id }).exec((error) => {
            if (error) { console.log(error); reject({ deleted: false }) } else { resolve({ deleted: true }) }
          })
        }
      })
    }
  })
})

/**
 * delete an user
 * @param  {String} user_id
 * @return {Promise}
 */
const deleteUser = ({ user_id }) => new Promise((resolve, reject) => {
    // first we need to remvoe any discussion the user created
  Discussion.remove({ user_id }).exec((error) => {
    if (error) { console.log(error); reject({ deleted: false }) } else {
        // now we need to remove any opinions that are created by the user
      Opinion.remove({ user_id }).exec((error) => {
        if (error) { console.log(error); reject({ deleted: false }) } else {
            // finally we can remove the user
          User.remove({ _id: user_id }).exec((error) => {
            if (error) { console.log(error); reject({ deleted: false }) } else { resolve({ deleted: true }) }
          })
        }
      })
    }
  })
})

/**
 * delete a single discussion
 * @param  {String} discussion_id
 * @return {Promise}
 */
const deleteDiscussion = ({ discussion_id }) => new Promise((resolve, reject) => {
    // first we need to remove any opinion regarding the discussion
  Opinion.remove({ discussion_id }).exec((error) => {
    if (error) { console.log(error); reject({ deleted: false }) } else {
        // now we need to remove the discussion
      Discussion.remove({ _id: discussion_id }).exec((error) => {
        if (error) { console.log(error); reject({ deleted: false }) } else { resolve({ deleted: true }) }
      })
    }
  })
})

export default {
  getAdminDashInfo,
  createForum,
  deleteForum,
  deleteUser,
  deleteDiscussion,
}
