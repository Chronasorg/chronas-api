// controllers
import express from 'express'
import { config } from '../../../../config/config'
import expressJwt from 'express-jwt'

const getAllOpinions = require('./controller').getAllOpinions
const voteOpinion = require('./controller').voteOpinion
const createOpinion = require('./controller').createOpinion
const deleteOpinion = require('./controller').deleteOpinion

const router = express.Router() // eslint-disable-line
/**
 * opinion apis
 */

  // create an opinion
router.route('/newOpinion').post(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  // if (req.user) {
    createOpinion(req.body, req, res).then(
        (result) => { res.send(result) },
        (error) => { res.send(error) }
      )
  // } else {
  //   res.send({ authenticated: false })
  // }
  })

// vote an opinion
router.route('/voteOpinion/:opinion_id').put(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
    // if (req.user) {
    const voteDelta = +req.query.delta || 0
    voteOpinion(req, res, req.params.opinion_id, ((voteDelta > -3 && voteDelta < 3) ? voteDelta : 0)).then(
      (result) => { res.send({ voted: true }) },
      (error) => { res.send({ voted: false }) }
    )
    // }
  })

  // remove an opinion
router.route('/deleteOpinion/:opinion_id').delete(
  expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
  (req, res) => {
  // if (req.user) {
    deleteOpinion(req.params.opinion_id).then(
        (result) => { res.send({ deleted: true }) },
        (error) => { res.send({ deleted: false }) }
      )
  // }
  })

export default router
