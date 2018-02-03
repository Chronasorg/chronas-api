import express from 'express'
import validate from 'express-validation'
import expressJwt from 'express-jwt'
import passport from 'passport'
import paramValidation from '../../config/param-validation'
import authCtrl from '../controllers/auth.controller'
import config from '../../config/config'
import twitter from '../auths/twitter'
import facebook from '../auths/facebook'
import google from '../auths/google'
import github from '../auths/github'

const router = express.Router() // eslint-disable-line new-cap

/** POST /v1/auth/login - Returns token if correct username and password is provided */
router.route('/login')
  .post(validate(paramValidation.login), authCtrl.login)

/** GET /v1/auth/login/twitter - Returns token if third party auth successful */
router.route('/login/twitter')
  .get(twitter.authenticateUser)
  // .get(passport.authenticate('twitter'))

/** GET /v1/auth/login/facebook - Returns token if third party auth successful */
router.route('/login/facebook')
  .get(facebook.authenticateUser)

/** GET /v1/auth/login/google - Returns token if third party auth successful */
router.route('/login/google')
  .get(google.authenticateUser)

/** GET /v1/auth/login/github - Returns token if third party auth successful */
router.route('/login/github')
  .get(github.authenticateUser)


export default router
