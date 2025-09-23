// forum controllers
import express from 'express'
import { config } from '../../config/config.js'
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
    const { q, offset, limit } = req.query
    getDiscussions(req.params.forum_slug, false, req.query.sorting_method, q, offset, limit).then(
      (result) => {
        res.set('Access-Control-Expose-Headers', 'X-Total-Count')
        res.set('X-Total-Count', result[1])
        res.json(result[0])
        // res.send(result)
      },
      (error) => {
        res.set('X-Total-Count', 0)
        res.json(result[0])
        // res.send([])
      }
    )
  })

// get pinned discussions of a forum
router.route('/:forum_slug/pinned_discussions').get(
  // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
    const { q, offset, limit } = req.query
    getDiscussions(req.params.forum_slug, true, false, false, offset, limit).then(
      (result) => { res.send(result[0]) },
      (error) => { res.send([]) }
    )
  })

export default router
