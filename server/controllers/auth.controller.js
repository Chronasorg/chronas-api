import jwt from 'jsonwebtoken';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';
import { config } from '../../config/config.js';
import User from '../models/user.model.js';
import { TOKEN_LIFETIME } from '../helpers/require-auth.js';

function displayName(user) {
  return user.username || (typeof user.name === 'string' ? user.name : (((user || {}).name || {}).first));
}

function tokenClaims(user) {
  return {
    id: user.email || user._id || user.id,
    avatar: user.avatar || user.gravatar,
    username: displayName(user),
    score: user.karma,
    lastUpdated: user.lastUpdated || user.lastLogin,
    privilege: user.privilege ? user.privilege : 1,
    subscription: user.subscription ? user.subscription : '-1'
  };
}

/**
 * Returns jwt token if valid username and password is provided
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
async function login(req, res, next) {
  try {
    const user = await User.findOne({ email: req.body.email }).select('+password').exec();

    // Accounts without a password (OAuth-only or wiped) answer like a wrong
    // password, so the status code doesn't reveal which accounts they are.
    if (user && req.body.email === user.email && user.password) {
      try {
        const isMatch = await user.comparePassword(req.body.password);

        if (!isMatch) {
          const err2 = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true);
          return next(err2);
        }

        const token = jwt.sign(tokenClaims(user), config.jwtSecret, { expiresIn: TOKEN_LIFETIME });

        user.loginCount = (Number(user.loginCount) || 0) + 1;
        await user.save();

        return res.json({
          token,
          username: displayName(user)
        });
      } catch (err) {
        return next(err);
      }
    }

    const err = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true);
    return next(err);
  } catch {
    const err = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true);
    return next(err);
  }
}


export default { login };
