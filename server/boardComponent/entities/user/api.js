import express from 'express'

const passport = require('passport')
const signIn = require('./controller').signIn
const getFullProfile = require('./controller').getFullProfile

const router = express.Router() // eslint-disable-line
/**
 * user apis
 */

// get authenticated user
router.route('/user/getUser').get((req, res) => {
  if (req.user) res.send(req.user)
  else res.send(null)
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

// signout the user
router.route('/signout').get((req, res) => {
  req.logout()
  res.redirect('/')
})

// get user full profile
router.route('/:username').get((req, res) => {
  getFullProfile(req.params.username).then(
    (result) => { res.send(result) },
    (error) => { res.send({ error }) }
  )
})

export default router
