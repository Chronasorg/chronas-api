import express from 'express'
import config from "../../../../config/config";
import expressJwt from 'express-jwt'

const passport = require('passport')
const signIn = require('./controller').signIn
const getFullProfile = require('./controller').getFullProfile

const router = express.Router() // eslint-disable-line
/**
 * user apis
 */

// get authenticated user
router.route('/getUser').get(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  res.send(req.auth)
})

// github authentication route
router.route('/authViaGitHub').get(
  passport.authenticate('github')
)

// callback route from github
router.route('/authViaGitHub/callback').get(
  // this should match callback url of github app
  passport.authenticate('github', { failureRedirect: '/signIn/failed' }),
  (req, res) => { res.redirect('/') }
)

// get user full profile
router.route('/profile/:username').get(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  getFullProfile(req.params.username).then(
    (result) => { res.send(result) },
    (error) => { res.send({ error }) }
  )
})

export default router
