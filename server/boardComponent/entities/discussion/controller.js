import contactCtrl from '../../../controllers/contact.controller.js'

import toolsModule from '../../utilities/tools.js'
const { generateDiscussionSlug } = toolsModule
import opinionController from '../opinion/controller.js'
const { getAllOpinions } = opinionController
import userController from '../user/controller.js'
const { getUser } = userController

import Discussion from './model.js'
import Opinion from '../opinion/model.js'

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
    .exec()
    .then(result => {
      if (!result) reject(null)
      else {
        result.user = {
          avatar: result.user.avatar,
          username: result.user.username,
          name: result.user.name,
          _id: result.user._id ||  result.user.id
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
                  _id: opinion.user._id || opinion.user.id
                }
              }
            })
            return resolve(result)
          },
          (error) => { { console.log(error); reject(error) } }
        )
      }
    })
    .catch(error => { console.log(error); reject(error) })
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
      .exec()
      .then(discussionFound => {
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

        discussionFound.save()
          .then(() => {
          return resolve(discussion)
        })
          .catch(error2 => {
            console.log(error2)
            return reject(error2)
          })
      })
      .catch(error => {
        console.log(error)
        return reject(error)
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

    newDiscussion.save()
      .then(() => {
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
      .catch(error => {
        console.log(error)
        reject(error)
      })
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
  Discussion.findById(discussion_id)
    .then(discussion => {
      if (!discussion) reject(null)
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

        return discussion.save()
          .then(updatedDiscussion => {
            resolve(updatedDiscussion)
          })
      }
    })
    .catch(error => { console.log(error); reject(error) })
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
    .exec()
    .then(discussion => {

      // get the discussion id
      const discussion_id = discussion._id

      // remove any opinion regarding the discussion
      Opinion
      .remove({ discussion_id })
      .exec()
      .then(() => {
        // finally remove the discussion
        return Discussion
          .remove({ discussion_slug })
          .exec()
          .then(() => {
            resolve({ deleted: true })
          })
          .catch(error => { console.log(error); reject(error) })
      })
      .catch(error => { console.log(error); reject(error) })
    })
    .catch(error => { console.log(error); reject(error) })
})

export default {
  getDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  toggleFavorite,
}
