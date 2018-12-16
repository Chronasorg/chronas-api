import passport from 'passport'
import { OAuth2Strategy } from 'passport-google-oauth'
import jwt from 'jsonwebtoken'
import { config } from '../../config/config'
import userCtrl from '../controllers/user.controller'
import metadataCtrl from "../controllers/metadata.controller";
import Promise from "bluebird";

const credentials = {
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  scope: 'profile email'
}

function authenticateUser(req, res, next) {
  const self = this

  let redirect = process.env.CHRONAS_HOST
  if (req.cookies.target && req.cookies.target === 'app') redirect = '/auth/app'

  // Begin process
  console.log('============================================================')
  console.log('[services.google] - Triggered authentication process...')
  console.log('------------------------------------------------------------')

  // Initalise Google credentials
  const googleStrategy = new OAuth2Strategy(credentials, (accessToken, refreshToken, profile, done) => {
    done(null, {
      accessToken,
      refreshToken,
      profile
    })
  })

  // Pass through authentication to passport
  passport.use(googleStrategy)

  // Save user data once returning from Google
  if (typeof (req.query || {}).cb !== 'undefined') {
    console.log('[services.google] - Callback workflow detected, attempting to process data...')
    console.log('------------------------------------------------------------')

    passport.authenticate('google', { session: false }, (err, data, info) => {
      if (err || !data) {
        console.log(`[services.google] - Error retrieving Google account data - ${JSON.stringify(err)}`)
        return res.redirect(`${process.env.CHRONAS_HOST}/#/login`)
        // const err = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true)
        // return next(err)
      }

      console.log('[services.google] - Successfully retrieved Google account data, processing...')
      console.log('------------------------------------------------------------',data.profile)

      const auth = {
        id: 'google' + data.profile.id,
        type: 'google',
        name: {
          first: data.profile.name.givenName,
          last: data.profile.name.familyName
        },
        email: data.profile.emails.length ? (data.profile.emails)[0].value : null,
        website: data.profile._json.blog,
        profileId: data.profile.id,
        privilege: 1,
        username: data.profile.username || data.profile.displayName || data.profile.id,
        avatar: data.profile.photos.length ? (data.profile.photos)[0].value : null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }

      req.body = {
        id: auth.type + auth.profileId,
        authType: auth.type,
        avatar: auth.avatar,
        email: auth.email,
        privilege: 1,
        username: auth.username,
        name: `${auth.name.first} ${auth.name.last}`,
        thirdParty: true,
        website: auth.website,
      }

      // new Promise((resolve, reject) => {
      userCtrl.create(req, res, next)
      // }).then(() => {
      //   req.session.auth = auth
      //   const token = jwt.sign(auth, config.jwtSecret)
      //   return res.redirect(`${process.env.CHRONAS_HOST}/?token=${token}`)
      // })
      // return res.redirect(redirect);
    })(req, res, next)

    // Perform inital authentication request to Google
  } else {
    console.log('[services.google] - Authentication workflow detected, attempting to request access...')
    console.log('------------------------------------------------------------')

    passport.authenticate('google', { accessType: 'offline' })(req, res, next) // approvalPrompt: 'force'
  }
}

export default { authenticateUser }
