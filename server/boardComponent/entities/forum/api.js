// forum controllers
import express from 'express'
import { config } from "../../../../config/config";
import expressJwt from 'express-jwt'

const getAllForums = require('./controller').getAllForums
const getDiscussions = require('./controller').getDiscussions

/**
 * forum apis
 */
const router = express.Router() // eslint-disable-line

  // get all forums
router.route('/').get(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  getAllForums().then(
      (result) => { res.send(result) },
      (error) => { res.send(error) }
    )
})

  // get discussions of a forum
router.route('/:forum_slug/discussions').get(
  // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  getDiscussions(req.params.forum_slug, false, req.query.sorting_method, req.query.q).then(
      (result) => { res.send(result) },
      (error) => { res.send([]) }
    )
})

  // get pinned discussions of a forum
router.route('/:forum_slug/pinned_discussions').get(
  // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  getDiscussions(req.params.forum_slug, true).then(
      (result) => { res.send(result) },
      (error) => { res.send([]) }
    )
})

export default router
