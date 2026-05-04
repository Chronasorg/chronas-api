import httpStatus from 'http-status';

const gone = (req, res) => res.status(httpStatus.GONE).json({
  message: 'The collections API has been retired.'
});

const loadGone = (req, res, next) => next();

export default {
  load: loadGone,
  get: gone,
  create: gone,
  update: gone,
  updateBookmark: gone,
  remove: gone,
  list: gone
};
