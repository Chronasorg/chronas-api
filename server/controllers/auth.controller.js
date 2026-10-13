import jwt from 'jsonwebtoken';
import httpStatus from 'http-status';
import Moniker from 'moniker';

import APIError from '../helpers/APIError.js';
import { config } from '../../config/config.js';
import User from '../models/user.model.js';
import userCtrl from '../controllers/user.controller.js';

// TODO: add email service

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

        const token = jwt.sign(tokenClaims(user), config.jwtSecret);

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


/**
 * Returns jwt token and registers user if email not duplicate
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */

async function signup(req, res, next) {
  req.body.username = req.body.username || ((req.body.first_name && req.body.last_name)
    ? `${req.body.first_name} ${req.body.last_name}`
    : (req.body.first_name)
      ? req.body.first_name
      : (req.body.last_name) ? req.body.last_name : Moniker.choose());

  // TODO: add email service
  // mandrill('/messages/send', {
  //   message: {
  //     to: [{email: req.body.email, name: req.body.username}],
  //     from_email: 'noreply@chronas.org',
  //     subject: "Chronas Account Verification",
  //     text: "Thanks for signing up! This email can be used to reset your password should you ever forget it."
  //   }
  // }, function(error, response)
  // {
  //   //uh oh, there was an error
  //   if (error) console.log( JSON.stringify(error) );
  //
  //   //everything's good, lets see what mandrill said
  //   else console.log(response);
  // });

  try {
    const { token, user } = await userCtrl.createLocalUser({
      email: req.body.email,
      password: req.body.password,
      username: req.body.username
    });
    return res.json({ token, username: user.username });
  } catch (e) {
    return next(e);
  }
}

/**
 * Refresh JWT token. Reloads the user so the new token carries the current
 * privilege and subscription, and refuses tokens for deleted users.
 */
async function refresh(req, res, next) {
  try {
    const user = await User.findById((req.auth || {}).id).exec();
    if (!user) {
      return next(new APIError('Token refresh failed', httpStatus.UNAUTHORIZED, true));
    }
    const token = jwt.sign(tokenClaims(user), config.jwtSecret);
    return res.json({ token, username: displayName(user) });
  } catch {
    return next(new APIError('Token refresh failed', httpStatus.UNAUTHORIZED, true));
  }
}

export default { login, signup, refresh };
