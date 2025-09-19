import express from 'express'
import validate from 'express-validation'
import paramValidation from '../../config/param-validation.js'
import authCtrl from '../controllers/auth.controller.js'
import twitter from '../auths/twitter.js'
import facebook from '../auths/facebook.js'
import google from '../auths/google.js'
import github from '../auths/github.js'

const router = express.Router() // eslint-disable-line new-cap

/** POST /v1/auth/login - Returns token if correct email and password is provided */
router.route('/login')
  .post(validate(paramValidation.login), authCtrl.login)

/** POST /v1/auth/signup - Returns token if email not duplicated*/
router.route('/signup')
  .post(validate(paramValidation.signup), authCtrl.signup)

/** GET /v1/auth/login/twitter - Returns token if third party auth successful */
router.route('/login/twitter')
  .get(twitter.authenticateUser)

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
