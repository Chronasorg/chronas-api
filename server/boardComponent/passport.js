/**
 * module dependencies for passport configuration
 */
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github';

const { GITHUB_CLIENT_ID } = process.env;
const { GITHUB_CLIENT_SECRET } = process.env;
const { GITHUB_CALLBACK_URL } = process.env;

// controllers
const { getUser } = require('./entities/user/controller');

/**
 * passport configuration
 */
const passportConfig = (app) => {
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser((id, done) => {
    getUser(id).then((user) => { done(null, user); },
      (error) => { done(error); }
    );
  });

  // github strategy for passport using OAuth
  passport.use(new GitHubStrategy(
    {
      clientID: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL: GITHUB_CALLBACK_URL,
      scope: 'user:email'
    }
  ));
};

export default passportConfig;
