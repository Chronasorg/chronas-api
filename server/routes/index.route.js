import express from 'express'
import areaRoutes from './area.route'
import authRoutes from './auth.route'
import collectionRoutes from './collection.route'
import flagRoutes from './flag.route'
import userRoutes from './user.route'
import contactRoutes from './contact.router'
import markerRoutes from './marker.route'
import metadataRoutes from './metadata.route'
import staticRoutes from './static.route'
import statisticsRoutes from './statistics.route'
import revisionRoutes from './revision.route'
import versionRoutes from './version.router'
import boardRoutes from '../boardComponent/routes'

const router = express.Router() // eslint-disable-line new-cap

/** GET /health - Check service health */
router.get('/health', (req, res) =>
  res.send('OK')
)

// mount auth routes at /auth
router.use('/auth', authRoutes)

// mount user routes at /areas
router.use('/areas', areaRoutes)

// mount email send routes at /contact
router.use('/contact', contactRoutes)

// mount user routes at /collections
router.use('/collections', collectionRoutes)

// mount user routes at /flags
router.use('/flags', flagRoutes)

// mount user routes at /users
router.use('/users', userRoutes)

// mount user routes at /markers
router.use('/markers', markerRoutes)

// mount user routes at /metadata
router.use('/metadata', metadataRoutes)

// mount user routes at /revisions
router.use('/revisions', revisionRoutes)

// mount version routes at /version and on blank
router.use('/version', versionRoutes)
router.use('/', versionRoutes)

// Third Party ReForum App
// mount board routes at /board
router.use('/board', boardRoutes)

router.use('/image', staticRoutes)

router.use('/statistics', statisticsRoutes)

export default router
