import passport from 'passport'
import { Strategy } from 'passport-twitter'
import jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import { config } from '../../config/config.js'
import userCtrl from '../controllers/user.controller'
import APIError from '../helpers/APIError.js'

const credentials = {
  consumerKey: config.twitterConsumerKey,
  consumerSecret: config.twitterConsumerSecret,
  callbackURL: config.twitterCallbackUrl
}

function authenticateUser(req, res, next) {
  const self = this

  let redirect = config.chronasHost
  if (req.cookies.target && req.cookies.target === 'app') redirect = '/auth/app'

  // Begin process
  console.log('============================================================')
  console.log('[services.twitter] - Triggered authentication process...')
  console.log('------------------------------------------------------------')

  // Initalise Twitter credentials
  const twitterStrategy = new Strategy(credentials, (accessToken, refreshToken, profile, done) => {
    done(null, {
      accessToken,
      refreshToken,
      profile
    })
  })

  // Pass through authentication to passport
  passport.use(twitterStrategy)

  // Save user data once returning from Twitter
  if (typeof (req.query || {}).oauth_token !== 'undefined') {
    req.query.cb = req.query.oauth_token
    console.log('[services.twitter] - Callback workflow detected, attempting to process data...')
    console.log('------------------------------------------------------------')

    passport.authenticate('twitter', { session: false }, (err, data, info) => {
      if (err || !data) {
        console.log(`[services.twitter] - Error retrieving Twitter account data - ${JSON.stringify(err)}`)
        // return res.json({ errr: `[services.twitter] - Error retrieving Twitter account data - ${JSON.stringify(err)}`, data: data, info: info, cb: req.query})
        const err2 = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true)
        return next(err2)
      }

      console.log('[services.twitter] - Successfully retrieved Twitter account data, processing...')
      console.log('------------------------------------------------------------')

      const name = data.profile && data.profile.displayName ? data.profile.displayName.split(' ') : [],
        profileJSON = JSON.parse(data.profile._raw),
        urls = profileJSON.entities.url && profileJSON.entities.url.urls && profileJSON.entities.url.urls.length ? profileJSON.entities.url.urls : []

      const auth = {
        id: `twitter${data.profile.id}`,
        type: 'twitter',
        name: {
          first: name.length ? name[0] : '',
          last: name.length > 1 ? name[1] : ''
        },
        privilege: 1,
        website: urls.length ? urls[0].expanded_url : '',
        profileId: data.profile.id,
        username: data.profile.username,
        avatar: data.profile._json.profile_image_url.replace('_normal', ''),
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }

      req.body = {
        id: auth.id,
        authType: auth.type,
        privilege: 1,
        avatar: auth.avatar,
        username: auth.username,
        name: `${auth.name.first} ${auth.name.last}`,
        thirdParty: true,
        website: auth.website,
      }

      userCtrl.create(req, res, next)
      // req.session.auth = auth
      //
      // const token = jwt.sign(auth, config.jwtSecret)
      // return res.redirect(redirect);
    })(req, res, next)

    // Perform inital authentication request to Twitter
  } else {
    console.log('[services.twitter] - Authentication workflow detected, attempting to request access...')
    console.log('------------------------------------------------------------')

    passport.authenticate('twitter')(req, res, next)
  }
}

export default { authenticateUser }
