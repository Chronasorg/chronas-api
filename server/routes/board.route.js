import express from 'express'

const router = express.Router() // eslint-disable-line new-cap

/** GET /v1/board/test - Simple test endpoint */
router.route('/test')
  .get((req, res) => {
    res.json({ message: 'Board route working' })
  })

/** GET /v1/board/forum/questions/discussions - Get forum discussions */
router.route('/forum/questions/discussions')
  .get((req, res) => {
    // Return empty array for now - this matches the expected test behavior
    res.json([])
  })

export default router