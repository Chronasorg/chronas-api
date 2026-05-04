import httpStatus from 'http-status';

const gone = (req, res) => res.status(httpStatus.GONE).json({
  message: 'The game API has been retired.'
});

export default { create: gone, list: gone };
