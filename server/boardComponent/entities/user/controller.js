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
const getUser = user_id => new Promise((resolve, reject) => {
  User.findOne({ _id: user_id }, (error, user) => {
    if (error) { console.log(error); reject(error) } else if (!user) reject(null)
    else resolve(user)
  })
})


/**
 * get the full profile of a user
 * @param  {String} username
 * @return {Promise}
 */
const getFullProfile = username => new Promise((resolve, reject) => {
  User
    .findOne({ username })
    .lean()
    .exec((error, foundUser) => {
      if (error) { console.log(error); reject(error) }
      if (!foundUser) reject('not_found')
      else {
        // TODO: add opinions!
        // we got the user, now we need all discussions by the user
        Opinion
          .find({ user_id: foundUser._id || foundUser.id })
          .limit(10)
          .populate('discussion')
          .exec((error, opinions) => {
            if (error) { console.log(error) } else {
              foundUser.opinions = opinions
            }
            Discussion
            .find({ user_id: foundUser._id || foundUser.id })
            .limit(10)
            .populate('forum')
            .lean()
            .exec((error, discussions) => {
              if (error) { console.log(error); reject(error) } else {
                // we got the discussions by the user
                // we need to add opinion count to each discussion
                asyncEach(discussions, (eachDiscussion, callback) => {
                  getAllOpinions(eachDiscussion._id).then(
                    (opinions) => {
                      // add opinion count to discussion doc
                      eachDiscussion.opinion_count = opinions ? opinions.length : 0
                      callback()
                    },
                    (error) => { console.error(error); callback(error) }
                  )
                }, (error) => {
                  if (error) { console.log(error); reject(error) } else {
                    foundUser.discussions = discussions
                    resolve(foundUser)
                  }
                })
              }
            })
          })
      }
    })
})

export default {
  getUser,
  getFullProfile,
}
