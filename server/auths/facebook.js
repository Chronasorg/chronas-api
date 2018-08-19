import passport from 'passport'
import { Strategy } from 'passport-facebook'
import jwt from 'jsonwebtoken'
import { config } from '../../config/config'
import userCtrl from '../controllers/user.controller'

const credentials = {
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL: process.env.FACEBOOK_CALLBACK_URL,
  profileFields: ['id', 'displayName', 'photos', 'email']
}

function authenticateUser(req, res, next) {
  const self = this

  let redirect = process.env.CHRONAS_HOST
  if (req.cookies.target && req.cookies.target === 'app') redirect = '/auth/app'

  // Begin process
  console.log('============================================================')
  console.log('[services.facebook] - Triggered authentication process...')
  console.log('------------------------------------------------------------')

  // Initalise Facebook credentials
  const facebookStrategy = new Strategy(credentials, (accessToken, refreshToken, profile, done) => {
    done(null, {
      accessToken,
      refreshToken,
      profile
    })
  })

  // Pass through authentication to passport
  passport.use(facebookStrategy)

  // Save user data once returning from Facebook
  if (typeof (req.query || {}).cb !== 'undefined') {
    console.log('[services.facebook] - Callback workflow detected, attempting to process data...')
    console.log('------------------------------------------------------------')

    passport.authenticate('facebook', { session: false }, (err, data) => {
      if (err || !data) {
        console.log(`[services.facebook] - Error retrieving Facebook account data - ${JSON.stringify(data)} ${JSON.stringify(err)}`)
        return res.redirect('/signin')
      }

      console.log('[services.facebook] - Successfully retrieved Facebook account data, processing...')
      console.log('------------------------------------------------------------')

      const name = (data.profile && data.profile.displayName) ? data.profile.displayName.split(' ') : []
      //
      const auth = {
        type: 'facebook',
        name: {
          first: name.length ? name[0] : '',
          last: name.length > 1 ? name[1] : ''
        },
        email: data.profile.emails && data.profile.emails.length ? (data.profile.emails)[0].value : null,
        website: data.profile._json.blog,
        profileId: data.profile.id,
        username: data.profile.displayName || data.profile.id,
        avatar: `https://graph.facebook.com/${data.profile.id}/picture?width=600&height=600`,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken
      }

      req.body = {
        id: auth.type + auth.profileId,
        authType: auth.type,
        avatar: auth.avatar,
        email: auth.email,
        username: auth.username,
        name: `${auth.name.first} ${auth.name.last}`,
        thirdParty: true,
        website: auth.website,
      }

      userCtrl.create(req, res, next)

      req.session.auth = auth

      const token = jwt.sign(auth, config.jwtSecret)

      return res.redirect(process.env.CHRONAS_HOST + '/?token=' + token)
    })(req, res, next)

    // Perform inital authentication request to Facebook
  } else {
    console.log('[services.facebook] - Authentication workflow detected, attempting to request access...')
    console.log('------------------------------------------------------------')

    passport.authenticate('facebook', { scope: ['email'] })(req, res, next)
  }
}

export default { authenticateUser }
