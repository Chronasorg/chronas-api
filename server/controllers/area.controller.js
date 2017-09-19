import Area from '../models/area.model';

/**
 * Load area and append to req.
 */
function load(req, res, next, id) {
  Area.get(id)
    .then((area) => {
      req.area = area; // eslint-disable-line no-param-reassign
      return next();
    })
    .catch(e => next(e));
}

/**
 * Get area
 * @returns {Area}
 */
function get(req, res) {
  return res.json(req.area);
}

/**
 * Create new area
 * @property {string} req.body.name - The areaname of area.
 * @property {string} req.body.privilege - The privilege of area.
 * @returns {Area}
 */
function create(req, res, next) {
  const area = new Area({
    year: req.body.year,
    data: req.body.data
  });

  area.save()
    .then(savedArea => res.json(savedArea))
    .catch(e => next(e));
}

/**
 * Update existing area
 * @property {string} req.body.areaname - The areaname of area.
 * @property {string} req.body.privilege - The privilege of area.
 * @returns {Area}
 */
function update(req, res, next) {

  const area = req.area;
  if (typeof req.body.year !== "undefined") area.year = req.body.year;
  if (typeof req.body.data !== "undefined") area.data = req.body.data;

  area.save()
    .then(savedArea => res.json(savedArea))
    .catch(e => next(e));
}

/**
 * Get area list.
 * @property {number} req.query.offset - Number of year to start from.
 * @property {number} req.query.length - Limit number of areas to be returned.
 * @returns {Area[]}
 */
function list(req, res, next) {
  const { offset = 0, length = 50 } = req.query;
  Area.list({ offset, length })
    .then(areas => {
      let areasTmp = JSON.parse(JSON.stringify(areas)) || [],
        areasToList = []

      for (let i = 0; i < areasTmp.length; i++) {
        if (areasTmp[i].owner === req.user.username
          || areasTmp[i].privilegeLevel.indexOf("public") > -1) {
          areasToList.push(areasTmp[i])
        }
      }

      res.json(areasToList)
    })
    .catch(e => next(e));
}

/**
 * Delete area.
 * @returns {Area}
 */
function remove(req, res, next) {
  const area = req.area;
  area.remove()
    .then(deletedArea => res.json(deletedArea))
    .catch(e => next(e));
}

export default { load, get, create, update, list, remove };
