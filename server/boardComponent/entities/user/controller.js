const _ = require('lodash');
const asyncEach = require('async/each');

// controllers
const getAllOpinions = require('../opinion/controller').getAllOpinions;

// models
const User = require('./model');
const Discussion = require('../discussion/model');
const Opinion = require('../opinion/model');

/**
 * get user doc by user id
 * @param  {ObjectId} user_id
 * @return {promise}
 */
const getUser = (user_id) => {
  return new Promise((resolve, reject) => {
    User.findOne({ _id: user_id }, (error, user) => {
      if (error) { console.log(error); reject(error); }
      else if (!user) reject(null);
      else resolve(user);
    });
  });
};


/**
 * get the full profile of a user
 * @param  {String} username
 * @return {Promise}
 */
const getFullProfile = (username) => {
  return new Promise((resolve, reject) => {
    User
    .findOne({ username })
    .lean()
    .exec((error, result) => {
      if (error) { console.log(error); reject(error); }
      else if (!result) reject('not_found');
      else {
        // TODO: add opinions!
        // we got the user, now we need all discussions by the user
        Opinion
          .find({ user_id: result._id })
          .populate('discussion')
          .exec((error, opinions) => {
            if (error) { console.log(error) }
            else {
              result.opinions = opinions
            }
            Discussion
            .find({ user_id: result._id })
            .populate('forum')
            .lean()
            .exec((error, discussions) => {
              if (error) { console.log(error); reject(error); }
              else {
                // we got the discussions by the user
                // we need to add opinion count to each discussion
                asyncEach(discussions, (eachDiscussion, callback) => {
                  getAllOpinions(eachDiscussion._id).then(
                    (opinions) => {
                      // add opinion count to discussion doc
                      eachDiscussion.opinion_count = opinions ? opinions.length : 0;
                      callback();
                    },
                    (error) => { console.error(error); callback(error); }
                  );
                }, (error) => {
                  if (error) { console.log(error); reject(error); }
                  else {
                    result.discussions = discussions;
                    resolve(result);
                  }
                });
              }
            })
          })
      }
    });
  });
};

module.exports = {
  getUser,
  getFullProfile,
};
