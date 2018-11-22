import express from 'express'
import statisticsCtrl from '../controllers/statistics.controller'

const router = express.Router() // eslint-disable-line new-cap

// get general data statistics
router.route('/')
  .get(statisticsCtrl.list)

export default router
