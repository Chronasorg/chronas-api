/**
 * module dependencies for routes configuration
 */

import userRoutes from './entities/user/api.js'
import forumRoutes from './entities/forum/api.js'
import discussionRoutes from './entities/discussion/api.js'
import opinionRoutes from './entities/opinion/api.js'
import adminRoutes from './entities/admin/api.js'
import path from 'path'
import express from 'express'

const router = express.Router() // eslint-disable-line new-cap

// mount user routes at /users
router.use('/user', userRoutes)

// mount forum routes at /forum
router.use('/forum', forumRoutes)

// mount discussion routes at /discussion
router.use('/discussion', discussionRoutes)

// mount opinion routes at /opinion
router.use('/opinion', opinionRoutes)

// mount admin routes at /admin
router.use('/admin', adminRoutes)


export default router
