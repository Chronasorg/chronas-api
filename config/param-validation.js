import Joi from 'joi';

export default {
  // POST /api/users
  createUser: {
    body: {
      username: Joi.string().required(),
      privilege: Joi.string().required()
    }
  },

  // POST /api/markers
  createMarker: {
    body: {
      name: Joi.string().required(),
      privilegeLevel: Joi.string().required(),
      layout: Joi.string().required()
    }
  },

  // POST /api/areas
  createArea: {
    body: {
      name: Joi.string().required(),
      privilegeLevel: Joi.string().required(),
      url: Joi.string().required(),
      format: Joi.string().required(),
      timeFormat: Joi.string().required(),
      dataSchema: Joi.string().required()
    }
  },

  // UPDATE /api/users/:userId
  updateUser: {
    body: {
      username: Joi.string(),
      privilege: Joi.string()
    },
    params: {
      userId: Joi.string().hex().required()
    }
  },

  // UPDATE /api/markers/:markerId
  updateMarker: {
    body: {
      name: Joi.string(),
      privilegeLevel: Joi.string(),
      layout: Joi.string()
    },
    params: {
      markerId: Joi.string().hex().required()
    }
  },

  // UPDATE /api/area/:areaId
  updateArea: {
    body: {
      name: Joi.string(),
      privilegeLevel: Joi.string(),
      url: Joi.string(),
      format: Joi.string(),
      timeFormat: Joi.string(),
      dataSchema: Joi.string()
    },
    params: {
      areaId: Joi.string().hex().required()
    }
  },

  // POST /api/auth/login
  login: {
    body: {
      username: Joi.string().required(),
      password: Joi.string().required()
    }
  }
};
