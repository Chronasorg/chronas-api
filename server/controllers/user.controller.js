import jwt from 'jsonwebtoken';
import httpStatus from 'http-status';

import User from '../models/user.model.js';
import APIError from '../helpers/APIError.js';
import checkPrivilege from '../helpers/privileges.js';
import { config } from '../../config/config.js';


/**
 * Load the user named in the URL. Runs after the JWT and ownership checks so
 * the response can't be used to probe which emails are registered.
 */
async function load(req, res, next) {
  try {
    const user = await User.findOne({ email: req.params.userId });
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).json({
        message: 'Not Found'
      });
    }
    req.user = user;
    return next();
  } catch (e) {
    res.status(httpStatus.NOT_FOUND).json({
      message: e.isPublic ? e.message : httpStatus[e.status],
      stack: config.env === 'development' ? e.stack : {}
    });
  }
}

const PROFILE_FIELDS = ['avatar', 'username', 'name', 'bio', 'education', 'website'];
const COUNTERS = ['count_linked', 'count_voted', 'count_deleted', 'count_updated', 'count_reverted', 'count_created', 'count_mistakes'];
const ADMIN_FIELDS = ['email', 'subscription', 'patreon', 'privilege', 'karma'];

/**
 * Response shape for a user. toJSON() drops the password.
 */
function serializeUser(user) {
  const out = user.toJSON();
  out.id = out._id;
  return out;
}

/**
 * Fields every new account starts with (the defaults of the pre-DynamoDB schema).
 */
function newUserDefaults() {
  const now = new Date().toISOString();
  const defaults = { karma: 1, loginCount: 1, privilege: 1, subscription: '-1', createdAt: now, lastUpdated: now };
  COUNTERS.forEach((counter) => { defaults[counter] = 0; });
  return defaults;
}

function signToken(user) {
  return jwt.sign({
    id: user._id || user.id,
    avatar: user.avatar,
    username: user.username,
    lastUpdated: user.lastUpdated,
    score: user.karma,
    privilege: user.privilege ? user.privilege : 1,
    subscription: user.subscription ? user.subscription : '-1'
  }, config.jwtSecret);
}

/**
 * Get user
 * @returns {User}
 */
function get(req, res) {
  return res.json(serializeUser(req.user));
}

/**
 * Create a local (email + password) account. Callers pass explicit values;
 * nothing is read from the request body, so clients can't set privilege.
 */
async function createLocalUser({ email, password, username }) {
  const existing = await User.findById(email).exec();
  if (existing) {
    throw new APIError('This username/ email already exists!', 400);
  }

  const user = new User({
    ...newUserDefaults(),
    _id: email,
    email,
    username,
    name: username,
    authType: 'chronas'
  });
  await user.setPassword(password);
  await user.save();
  return { user, token: signToken(user) };
}

/**
 * Log in or register a user returning from Google, Facebook or GitHub.
 * Only the passport callbacks call this, with a profile built server-side.
 */
async function loginOrCreateOAuthUser(req, res, next, profile) {
  try {
    const id = profile.email || profile.id;
    const existing = await User.findById(id).exec();

    if (existing) {
      if (profile.email === existing.email) {
        existing.loginCount = (Number(existing.loginCount) || 0) + 1;
        await existing.save();
        return res.redirect(`${config.chronasHost}/?token=${signToken(existing)}`);
      }
      return next(new APIError('This username/ email already exists with a different email address!', 400));
    }

    const user = new User({
      ...newUserDefaults(),
      _id: id,
      avatar: profile.avatar,
      website: profile.website,
      username: profile.username,
      name: profile.name || profile.username || profile.id,
      email: profile.email,
      authType: profile.authType
    });
    await user.save();
    return res.redirect(`${config.chronasHost}/?token=${signToken(user)}`);
  } catch (e) {
    return next(e);
  }
}

/**
 * Update existing user. Owners may change their profile fields and their
 * password (with the current one); everything else is admin-only.
 * @returns {User}
 */
async function update(req, res, next) {
  const { user } = req;
  const body = req.body || {};
  const isAdmin = checkPrivilege.isAdmin(req.auth);
  const isSelf = String((req.auth || {}).id || '').toLowerCase() === String(user._id || '').toLowerCase();

  try {
    PROFILE_FIELDS.forEach((field) => {
      if (typeof body[field] !== 'undefined') user[field] = body[field];
    });
    if (isAdmin) {
      ADMIN_FIELDS.forEach((field) => {
        if (typeof body[field] !== 'undefined') user[field] = body[field];
      });
    }

    if (typeof body.password !== 'undefined') {
      // Admins can set another user's password (there is no reset flow yet).
      // Changing your own password requires the current one, if there is one.
      if (isSelf && user.password) {
        const ok = typeof body.currentPassword === 'string' && await user.comparePassword(body.currentPassword);
        if (!ok) return next(new APIError('Current password is incorrect', httpStatus.UNAUTHORIZED, true));
      } else if (!isSelf && !isAdmin) {
        return next(new APIError('Unauthorized', httpStatus.UNAUTHORIZED, true));
      }
      await user.setPassword(body.password);
    }

    const savedUser = await user.save();
    res.json(serializeUser(savedUser));
  } catch (e) {
    next(e);
  }
}

async function changePoints(username, type, delta = 1) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.karma = (Number(user.karma) || 0) + delta;
      user[`count_${type}`] = (Number(user[`count_${type}`]) || 0) + delta;
      await user.save();
    }
  } catch (e) {
    console.error('Error changing points:', e);
  }
}


async function incrementLoginCount(username) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.loginCount = (Number(user.loginCount) || 0) + 1;
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
  const { patreon = false } = req.query;
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
        loginCount: u.loginCount
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
        loginCount: u.loginCount
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
    const { user } = req;
    const userToReturn = serializeUser(user);
    await user.deleteOne();
    res.json(userToReturn);
  } catch (e) {
    next(e);
  }
}

export default { changePoints, incrementLoginCount, load, get, createLocalUser, loginOrCreateOAuthUser, signToken, update, list, remove };
