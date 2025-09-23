import Marker from '../../../models/marker.model'

const asyncEach = require('async/each')

// models
const Forum = require('./model')
const Discussion = require('../discussion/model')

// controllers
const getAllOpinions = require('../opinion/controller').getAllOpinions
const getUser = require('../user/controller').getUser
const mongoose = require('mongoose')

/**
 * get all forums list
 * @type {Promise}
 */
const getAllForums = () => new Promise((resolve, reject) => {
  Forum
      .find({})
      .exec((error, results) => {
        if (error) { console.log(error); reject(error) } else if (!results) reject(null)
        else resolve(results)
      })
})

/**
 * get discussions of a forum
 * @param  {ObjectId} forum_slug
 * @param  {Boolean} pinned
 * @return {Promise}
 */
const getDiscussions = (forum_slug, pinned, sorting_method = 'date', qEntity = false, offset = 0, limit = 10) => new Promise((resolve, reject) => {
    // define sorthing method
  const sortWith = { }
  if (sorting_method === 'date') sortWith.date = -1
  if (sorting_method === 'popularity') sortWith.favorites = -1

  Forum
      .findOne({ forum_slug })
      .exec((error, forumFound) => {
        const searchObj = { pinned }
        if (qEntity) searchObj.qa_id = qEntity
        else searchObj.forum_id = (forumFound || {})._id

        Discussion
          .find(searchObj)
          .sort(sortWith)
          .populate('forum')
          .populate('user')
          .lean()
          .skip(+offset)
          .limit(+limit)
          .exec((error, discussions) => {
            if (error) { console.error(error); reject(error) } else if (!discussions) reject(null)
            else {
              Discussion
                .find(searchObj)
                .count().exec().then((discussionCount) => {
                // attach opinion count to each discussion
                  asyncEach(discussions, (eachDiscussion, callback) => {
                  // add opinion count
                    getAllOpinions((eachDiscussion || {})._id).then(
                    (opinions) => {
                      // add opinion count to discussion doc
                      eachDiscussion.opinion_count = opinions ? opinions.length : 0
                      callback()
                    },
                    (error) => { console.error(error); callback(error) }
                  )
                  }, (error) => {
                    if (error) { console.error(error); reject(error) } else resolve([discussions, discussionCount])
                  })
                })
            }
          })
      })
})

export default {
  getAllForums,
  getDiscussions,
}
