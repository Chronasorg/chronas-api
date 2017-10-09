import express from 'express'
import userRoutes from './user.route'
import markerRoutes from './marker.route'
import metadataRoutes from './metadata.route'
import areaRoutes from './area.route'
import authRoutes from './auth.route'

const router = express.Router() // eslint-disable-line new-cap

/** GET /health - Check service health */
router.get('/health', (req, res) =>
  res.send('OK')
)

// mount user routes at /users
router.use('/users', userRoutes)

// mount user routes at /markers
router.use('/markers', markerRoutes)

// mount user routes at /metadata
router.use('/metadata', metadataRoutes)

// mount user routes at /areas
router.use('/areas', areaRoutes)

// mount auth routes at /auth
router.use('/auth', authRoutes)

export default router
