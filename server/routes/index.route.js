import express from 'express';
import areaRoutes from './area.route.js';
import authRoutes from './auth.route.js';
import collectionRoutes from './collection.route.js';
import flagRoutes from './flag.route.js';
import gameRoutes from './game.route.js';
import userRoutes from './user.route.js';
import contactRoutes from './contact.router.js';
import markerRoutes from './marker.route.js';
import metadataRoutes from './metadata.route.js';
import staticRoutes from './static.route.js';
import statisticsRoutes from './statistics.route.js';
import revisionRoutes from './revision.route.js';
import versionRoutes from './version.router.js';
import boardRoutes from '../boardComponent/routes.js';

const router = express.Router() // eslint-disable-line new-cap

/** GET /health - Check service health */
router.get('/health', (req, res) =>
  res.send('Health OK')
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

// mount user routes at /game
router.use('/game', gameRoutes)

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
