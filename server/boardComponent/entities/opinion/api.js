// controllers
import express from 'express'

const getAllOpinions = require('./controller').getAllOpinions
const createOpinion = require('./controller').createOpinion
const deleteOpinion = require('./controller').deleteOpinion

const router = express.Router() // eslint-disable-line
/**
 * opinion apis
 */

  // create an opinion
router.route('/newOpinion').post((req, res) => {
  if (req.user) {
    createOpinion(req.body).then(
        (result) => { res.send(result) },
        (error) => { res.send(error) }
      )
  } else {
    res.send({ authenticated: false })
  }
})

  // remove an opinion
router.route('/deleteOpinion/:opinion_id').delete((req, res) => {
  if (req.user) {
    deleteOpinion(req.params.opinion_id).then(
        (result) => { res.send({ deleted: true }) },
        (error) => { res.send({ deleted: false }) }
      )
  }
})

export default router
