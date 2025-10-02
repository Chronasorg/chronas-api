import User from '../models/user.model.js';
import logger from '../../config/winston.js';
import APIError from '../helpers/APIError.js';
import { config } from '../../config/config.js';
import jwt from 'jsonwebtoken';
import httpStatus from 'http-status';
import axios from 'axios';


/**
 * Load user and append to req.
 */
async function load(req, res, next, id) {
  try {
    const user = await User.findOne({ email: id });
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({
        message: 'Not Found'
      });
    }
    req.user = user; // eslint-disable-line no-param-reassign
    return next();
  } catch (e) {
    res.status(httpStatus.NOT_FOUND).json({
      message: e.isPublic ? e.message : httpStatus[e.status],
      stack: config.env === 'development' ? e.stack : {}
    });
  }
}

/**
 * Get user
 * @returns {User}
 */
function get(req, res) {
  const userPlus = req.user.toObject()
  userPlus.id = userPlus._id
  return res.json(userPlus)
}

/**
 * Create new user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
async function create(req, res, next) {
  console.log('Attempting to create user');
  console.log('------------------------------------------------------------');

  try {
    const duplicatedUsername = await User.findById(req.body.email || req.body.id || req.body.username).exec();

    if (duplicatedUsername) {
      if (req.body.thirdParty) {
        if (req.body.email === duplicatedUsername.email) {
          duplicatedUsername.loginCount += 1;
          await duplicatedUsername.save();

          const token = jwt.sign({
            id: duplicatedUsername._id,
            avatar: duplicatedUsername.avatar,
            username: duplicatedUsername.username,
            lastUpdated: duplicatedUsername.lastUpdated,
            score: duplicatedUsername.karma,
            privilege: (duplicatedUsername.privilege !== 'undefined') ? duplicatedUsername.privilege : 1,
            subscription: (duplicatedUsername.subscription !== 'undefined') ? duplicatedUsername.subscription : "-1"
          }, config.jwtSecret);
          return res.redirect(`${config.chronasHost}/?token=${token}`);
        }
        // throw err?
        const err = new APIError('This username/ email already exists with a different email address!', 400);
        return next(err);
      }
      const err = new APIError('This username/ email already exists!', 400);
      return next(err);
    }

    const user = new User({
      _id: req.body.email || req.body.id || req.body.username,
      avatar: req.body.avatar,
      bio: req.body.bio,
      website: req.body.website,
      username: req.body.username,
      name: req.body.name || req.body.username || req.body.id,
      password: req.body.password,
      education: req.body.education,
      email: req.body.email,
      authType: req.body.authType || 'chronas',
      privilege: (req.body.privilege !== 'undefined') ? req.body.privilege : 1
    });

    try {
      const savedUser = await user.save();
      if (!req.body.thirdParty && !req.body.signup) {
        res.json(savedUser);
      } else {
        const token = jwt.sign({
          id: savedUser._id || savedUser.id,
          avatar: savedUser.avatar,
          username: savedUser.username,
          lastUpdated: savedUser.lastUpdated,
          score: savedUser.karma,
          privilege: (savedUser.privilege !== 'undefined') ? savedUser.privilege : 1,
          subscription: (savedUser.subscription !== 'undefined') ? savedUser.subscription : "-1"
        }, config.jwtSecret);
        if (req.body.thirdParty) {
          return res.redirect(`${config.chronasHost}/?token=${token}`);
        }
        return res.json({
          token,
          username: savedUser.username
        });
      }
    } catch (e) {
      console.log('ERROR Attempt to save user', e);
      console.log('------------------------------------------------------------');

      if (!req.body.thirdParty) {
        next(e);
      }
    }
  } catch (e) {
    console.log('ERROR Attempt to find user', e);
    console.log('------------------------------------------------------------');

    if (!req.body.thirdParty) {
      next(e);
    }
  }
}

/**
 * Update existing user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
async function update(req, res, next) {
  const user = req.user;
  const isAdmin = (req.auth && req.auth.privilege >= 5);
  if (typeof req.body.avatar !== 'undefined') user.avatar = req.body.avatar;
  if (typeof req.body.username !== 'undefined') user.username = req.body.username;
  if (typeof req.body.name !== 'undefined') user.name = req.body.name;
  if (typeof req.body.bio !== 'undefined') user.bio = req.body.bio;
  if (typeof req.body.privilege !== 'undefined' && isAdmin) user.privilege = req.body.privilege;
  if (typeof req.body.education !== 'undefined') user.education = req.body.education;
  if (typeof req.body.email !== 'undefined') user.email = req.body.email;
  if (typeof req.body.patreon !== 'undefined' && isAdmin) user.patreon = req.body.patreon;
  if (typeof req.body.subscription !== 'undefined') user.subscription = req.body.subscription;
  if (typeof req.body.karma !== 'undefined' && isAdmin) user.karma = req.body.karma;
  if (typeof req.body.website !== 'undefined') user.website = req.body.website;
  if (typeof req.body.password !== 'undefined') user.password = req.body.password;

  try {
    const savedUser = await user.save();
    res.json(savedUser);
  } catch (e) {
    next(e);
  }
}

async function changePoints(username, type, delta = 1) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.karma += delta;
      user[`count_${type}`] += delta;
      await user.save();
    }
  } catch (e) {
    console.error('Error changing points:', e);
  }
}


function optionallyCancelSub(doCancel, subId) {
  return new Promise((resolve, reject) => {
    console.debug("doCancel", doCancel)
    return resolve();
  })

}

async function updateSubscription(req, res, next) {
  const doCancel = req.params.doCancel == "cancel";
  const subId = req.params.subscriptionId;
  const user = req.user;
  const username = (req.user || {}).username;
  // check if user is same as auth.username
  console.debug("go1");

  try {
    await optionallyCancelSub(doCancel, subId);

    const foundUser = await User.findOne({ username }).exec();
    if (typeof foundUser !== 'undefined') {
      if (!doCancel) {
        foundUser.subscription = subId;
        foundUser.privilege = 5;
        console.debug("set subscription to ", subId, "for user", foundUser);
      } else {
        console.debug("set subscription to -1 for user", foundUser);
        foundUser.subscription = "-1";
        foundUser.privilege = 1;
      }
      await foundUser.save();

      if (doCancel) {
        const token = jwt.sign({
          id: foundUser._id || foundUser.id,
          avatar: foundUser.avatar,
          username: foundUser.username,
          lastUpdated: foundUser.lastUpdated,
          score: foundUser.karma,
          privilege: (foundUser.privilege !== 'undefined') ? foundUser.privilege : 1,
          subscription: "-1"
        }, config.jwtSecret);
        return res.json({
          token,
          username: foundUser.username || (((foundUser || {}).name || {}).first)
        });
      } else {
        console.debug("encoding token with sub " + foundUser.subscription);
        const token = jwt.sign({
          id: foundUser.email || foundUser._id || foundUser.id,
          avatar: foundUser.avatar || foundUser.gravatar,
          username: foundUser.username || (((foundUser || {}).name || {}).first),
          score: foundUser.karma,
          lastUpdated: foundUser.lastUpdated || foundUser.lastLogin,
          privilege: foundUser.privilege ? foundUser.privilege : 1,
          subscription: foundUser.subscription ? foundUser.subscription : "-1"
        }, config.jwtSecret);

        return res.json({
          token,
          username: foundUser.username || (((foundUser || {}).name || {}).first)
        });
      }
    } else {
      return res.send(404);
    }
  } catch (e) {
    console.debug(e);
    res.send(500);
  }
}

async function incrementLoginCount(username) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.loginCount += 1;
      await user.save();
    }
  } catch (e) {
    console.error('Error incrementing login count:', e);
  }
}

/**
 * Get user list.
 * @property {number} req.query.skip - Number of users to be skipped.
 * @property {number} req.query.limit - Limit number of users to be returned.
 * @returns {User[]}
 */
async function list(req, res, next) {
  const { start = 0, end = 10, count = 0, patreon = false, sort = 'createdAt', order = 'asc', filter = '' } = req.query;
  const limit = end - start;
  let highscoreCount = (req.query.top || 10);
  if (highscoreCount > 15) highscoreCount = 15;
  const countOnly = req.query.countOnly || false;

  try {
    if (patreon !== false) {
      const users = await User.find({ patreon: 1 })
        .sort({ karma: -1 })
        .limit(+highscoreCount)
        .lean()
        .exec();

      return res.json(users.map(u => ({
        avatar: u.avatar,
        name: u.name,
        username: u.username,
        karma: u.karma,
        count_mistakes: u.count_mistakes,
        count_linked: u.count_linked,
        count_created: u.count_created,
        count_reverted: u.count_reverted,
        count_updated: u.count_updated,
        count_deleted: u.count_deleted,
        count_voted: u.count_voted,
        lastUpdated: u.lastUpdated,
        createdAt: u.createdAt,
        loginCount: u.loginCount,
      })));
    }

    if (highscoreCount !== false) {
      const users = await User.find()
        .sort({ karma: -1 })
        .limit(+highscoreCount)
        .lean()
        .exec();

      return res.json(users.map(u => ({
        avatar: u.avatar,
        name: u.name,
        username: u.username,
        karma: u.karma,
        count_mistakes: u.count_mistakes,
        count_linked: u.count_linked,
        count_created: u.count_created,
        count_reverted: u.count_reverted,
        count_updated: u.count_updated,
        count_deleted: u.count_deleted,
        count_voted: u.count_voted,
        lastUpdated: u.lastUpdated,
        createdAt: u.createdAt,
        loginCount: u.loginCount,
      })));
    } else if (countOnly !== false) {
      const userCount = await User.countDocuments().exec();
      return res.json({ total: userCount });
    } else {
      res.status(401).json({ message: 'Unauthorized' });
    }
  } catch (e) {
    next(e);
  }
}

/**
 * Delete user.
 * @returns {User}
 */
async function remove(req, res, next) {
  try {
    const user = req.user;
    const userToReturn = user.toObject(); // Get the user document before deletion
    await user.deleteOne();
    res.json(userToReturn);
  } catch (e) {
    next(e);
  }
}

export default { changePoints, updateSubscription, incrementLoginCount, load, get, create, update, list, remove }
