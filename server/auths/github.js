import passport from 'passport'
import { Strategy } from 'passport-github'
import jwt from 'jsonwebtoken'
import config from '../../config/config'
import userCtrl from '../controllers/user.controller'

const credentials = {
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL
}

function authenticateUser(req, res, next) {
  const self = this

  let redirect = process.env.CHRONAS_HOST
  if (req.cookies.target && req.cookies.target === 'app') redirect = '/auth/app'

  // Begin process
  console.log('============================================================')
  console.log('[services.github] - Triggered authentication process...')
  console.log('------------------------------------------------------------')

  // Initalise GitHub credentials
  const githubStrategy = new Strategy(credentials, (accessToken, refreshToken, profile, done) => {
    done(null, {
      accessToken,
      refreshToken,
      profile
    })
  })

  // Pass through authentication to passport
  passport.use(githubStrategy)

  // Save user data once returning from GitHub
  if (typeof (req.query || {}).cb !== 'undefined') {
    console.log('[services.github] - Callback workflow detected, attempting to process data...')
    console.log('------------------------------------------------------------')

    passport.authenticate('github', { session: false }, (err, data, info) => {
      if (err || !data) {
        console.log(`[services.github] - Error retrieving GitHub account data - ${JSON.stringify(err)}`)
        return res.redirect('/signin')
      }

      console.log('[services.github] -  Successfully retrieved GitHub account data, processing...')
      console.log('------------------------------------------------------------')

      const name = data.profile && data.profile.displayName ? data.profile.displayName.split(' ') : []

      const auth = {
        type: 'github',
        name: {
          first: name.length ? name[0] : '',
          last: name.length > 1 ? name[1] : ''
        },
        website: data.profile._json.blog,
        profileId: data.profile.id,
        email: data.profile.email,
        username: data.profile.username,
        avatar: data.profile._json.avatar_url,
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
      // return res.redirect(redirect);
    })(req, res, next)

    // Perform inital authentication request to GitHub
  } else {
    console.log('[services.github] - Authentication workflow detected, attempting to request access...')
    console.log('------------------------------------------------------------')

    passport.authenticate('github', { scope: ['user:email'] })(req, res, next)
  }
}

export default { authenticateUser }
