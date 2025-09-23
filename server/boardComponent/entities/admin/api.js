// controllers
import express from 'express'
import { config } from '../../../../config/config.js'
import { expressjwt as expressJwt } from 'express-jwt'

import adminController from './controller.js'
const { getAdminDashInfo, createForum, deleteForum, deleteUser, deleteDiscussion } = adminController

/**
 * admin apis
 * @param  {Object} app
 */
const router = express.Router() // eslint-disable-line

  // get all info for admin dashboard
router.route('/admin_dashboard_info').get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    (req, res) => {
      getAdminDashInfo().then(
        (data) => { res.send(data) },
        (error) => { res.send(error) }
      )
    })

  // create a forum
router.route('/create_forum').post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    (req, res) => {
      const {
        title,
        slug,
      } = req.body

      createForum({ forum_name: title, forum_slug: slug }).then(
        (data) => { res.send(data) },
        (error) => { res.send(error) }
      )
    })

  // delete a forum
router.route('/delete_forum').post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    (req, res) => {
      deleteForum(req.body).then(
        (data) => { res.send(data) },
        (error) => { res.send(error) }
      )
    })

export default router
