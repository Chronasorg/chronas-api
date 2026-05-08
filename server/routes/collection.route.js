import express from 'express';
import httpStatus from 'http-status';

const router = express.Router();

const gone = (_req, res) => res.status(httpStatus.GONE).json({
  message: 'The collections API has been retired.'
});

router.all('/', gone);
router.all('/*splat', gone);

export default router;
