import Game from '../models/game.model.js'
import logger from '../../config/winston.js'
import APIError from '../helpers/APIError.js'
import { config } from '../../config/config.js'
import jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import Marker from "../models/marker.model";

/**
 * Create new game
 * @property {string} req.body.gamename - The gamename of game.
 * @property {string} req.body.privilege - The privilege of game.
 * @returns {Game}
 */
function create(req, res, next) {
  console.log('Attempting to create game')
  console.log('------------------------------------------------------------')
  const game = new Game({
    // _id: Math.random(),
    avatar: req.body.avatar,
    name: req.body.name,
    gold: req.body.gold,
    identified: req.body.identified,
    duration: req.body.duration
  })

  game.save()
    .then((savedGame) => {
      return res.json(savedGame)
    })
    .catch((e) => {
      console.log('ERROR Attempt to save game', e)
      console.log('------------------------------------------------------------')

      if (!req.body.thirdParty) {
        next(e)
      }
    })
}

/**
 * Get game list.
 * @property {number} req.query.skip - Number of games to be skipped.
 * @property {number} req.query.limit - Limit number of games to be returned.
 * @returns {Game[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, patreon = false, sort = 'createdAt', order = 'asc', filter = '' } = req.query
  const limit = end - start
  let highscoreCount = (req.query.top || 10)
  if (highscoreCount > 15) highscoreCount = 15
  const countOnly = req.query.countOnly || false

  if (highscoreCount !== false) {
    Game.find()
      .sort({ identified: -1, duration: -1 })
      .limit(+highscoreCount)
      .lean()
      .exec()
      .then((games) => {
        Game.count().exec().then((gameCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', gameCount)
          res.json(games.map(u => ({
            _id: u._id,
            avatar: u.avatar,
            name: u.name,
            gold: u.gold,
            identified: u.identified,
            createdAt: u.createdAt,
            duration: u.duration,
          })))
        })
      })
  } else if (countOnly !== false) {
    Game.count()
      .exec()
      .then((gameCount) => {
        res.json({ total: gameCount })
      })
  } else {
    res.status(401).json({ message: 'Unauthorized' })
  }
}

export default { create, list }
