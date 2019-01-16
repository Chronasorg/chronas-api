import contactCtrl from '../../../controllers/contact.controller'

const generateDiscussionSlug = require('../../utilities/tools').generateDiscussionSlug
const getAllOpinions = require('../opinion/controller').getAllOpinions
const getUser = require('../user/controller').getUser

const Discussion = require('./model')
const Opinion = require('../opinion/model')

/**
 * get a single discussion
 * @param  {String} discussion_slug
 * @param  {String} discussion_id
 * @return {Promise}
 */
const getDiscussion = (discussion_slug, discussion_id) => new Promise((resolve, reject) => {
  const findObject = {}
  if (discussion_slug) findObject.discussion_slug = discussion_slug
  if (discussion_id) findObject._id = discussion_id

  Discussion
    .findOne(findObject)
    .populate('forum')
    .populate('user')
    .lean()
    .exec((error, result) => {
      if (error) { console.log(error); reject(error) } else if (!result) reject(null)
      else {
        result.user = {
          avatar: result.user.avatar,
          username: result.user.username,
          name: result.user.name,
          _id: result.user._id
        }
        // add opinions to the discussion object
        getAllOpinions(result._id).then(
          (opinions) => {
            result.opinions = opinions.map((op) => {
              const opinion = op.toObject()
              return {
                ...opinion,
                user: {
                  avatar: opinion.user.avatar,
                  username: opinion.user.username,
                  name: opinion.user.name,
                  _id: opinion.user._id
                }
              }
            })
            console.debug("1done", result)
            // result.user = {
            //   avatar: user.avatar,
            //   username: user.username,
            //   name: user.name,
            //   _id: user._id
            // }
            console.debug("2return", result)
            return resolve(result)
          },
          (error) => { { console.log(error); reject(error) } }
        )
      }
    })
})

/**
 * Create a new discussion
 * @param  {Object} discussion
 * @return {Promise}
 */
const createDiscussion = (discussion, req, res) => new Promise((resolve, reject) => {
  const potentialDiscussionSlug = req.params.discussion_slug
  if (potentialDiscussionSlug) {
    Discussion
      .findOne({ discussion_slug: potentialDiscussionSlug })
      .exec((error, discussionFound) => {
        if (error) {
          console.log(error)
          return reject(error)
        }
        if (!discussionFound) {
          return reject('not found')
        }
        if (discussion.forumId) discussionFound.forum_id = discussion.forumId
        if (discussion.userId) discussionFound.user_id = discussion.userId
        if (discussion.title) discussionFound.title = discussion.title
        if (discussion.qa_id) discussionFound.qa_id = discussion.qa_id
        if (discussion.content) discussionFound.content = discussion.content
        if (discussion.favorites) discussionFound.favorites = []
        if (discussion.tags) discussionFound.tags = discussion.tags

        discussionFound.save((error2) => {
          if (error2) {
            console.log(error2)
            return reject(error2)
          }
          return resolve(discussion)
        })
      })
  } else {
    const newDiscussion = new Discussion({
      forum_id: discussion.forumId,
      forum: discussion.forumId,
      user_id: discussion.userId,
      user: discussion.userId,
      discussion_slug: generateDiscussionSlug(discussion.title),
      date: new Date(),
      title: discussion.title,
      qa_id: discussion.qa_id,
      content: discussion.content,
      favorites: [],
      tags: discussion.tags,
      pinned: discussion.pinned,
    })

    newDiscussion.save((error) => {
      if (error) {
        console.log(error)
        reject(error)
      }

      req.body = {
        subject: 'Chronas: New Post added',
        from: 'noreply@chronas.org',
        html: `Full payload: ${JSON.stringify({
          forum_id: discussion.forumId,
          forum: discussion.forumId,
          user_id: discussion.userId,
          user: discussion.userId,
          discussion_slug: generateDiscussionSlug(discussion.title),
          date: new Date(),
          title: discussion.title,
          qa_id: discussion.qa_id,
          content: discussion.content,
          favorites: [],
          tags: discussion.tags,
          pinned: discussion.pinned,
        }, undefined, '<br />')}`,
      }
      contactCtrl.create(req, res, false)
      return resolve(newDiscussion)
    })
  }
})

/**
 * toggle favorite status of discussion
 * @param  {ObjectId} discussion_id
 * @param  {ObjectId} user_id
 * @return {Promise}
 */
const toggleFavorite = (discussion_id, user_id) => new Promise((resolve, reject) => {
  Discussion.findById(discussion_id, (error, discussion) => {
    if (error) { console.log(error); reject(error) } else if (!discussion) reject(null)
    else {
        // add or remove favorite
      let matched = null
      for (let i = 0; i < discussion.favorites.length; i++) {
        if (String(discussion.favorites[i]) === String(user_id)) {
          matched = i
        }
      }
      if (matched === null) {
        discussion.favorites.push(user_id)
      } else {
        discussion.favorites = [
          ...discussion.favorites.slice(0, matched),
          ...discussion.favorites.slice(matched + 1, discussion.favorites.length),
        ]
      }


      discussion.save((error, updatedDiscussion) => {
        if (error) { console.log(error); reject(error) }
        resolve(updatedDiscussion)
      })
    }
  })
})

const updateDiscussion = (forum_id, discussion_slug) => {
  // TODO: implement update feature
}

const deleteDiscussion = discussion_slug => new Promise((resolve, reject) => {
    // find the discussion id first
  Discussion
    .findOne({ discussion_slug })
    .exec((error, discussion) => {
      if (error) { console.log(error); reject(error) }

      // get the discussion id
      const discussion_id = discussion._id

      // remove any opinion regarding the discussion
      Opinion
      .remove({ discussion_id })
      .exec((error) => {
        if (error) { console.log(error); reject(error) }

        // finally remove the discussion
        else {
          Discussion
          .remove({ discussion_slug })
          .exec((error) => {
            if (error) { console.log(error); reject(error) } else {
              resolve({ deleted: true })
            }
          })
        }
      })
    })
})

module.exports = {
  getDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  toggleFavorite,
}
