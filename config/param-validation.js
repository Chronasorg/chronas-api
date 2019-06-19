import Joi from 'joi'

export default {
  // POST /v1/users
  createUser: {
    body: {
      username: Joi.string().required()
    }
  },

  createGame: {
    body: {
      name: Joi.string().required()
    }
  },

  // POST /v1/markers
  createMarker: {
    body: {
      name: Joi.string().required(),
      privilegeLevel: Joi.string().required(),
      layout: Joi.string().required()
    }
  },

  // POST /v1/areas
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

  // UPDATE /v1/users/:userId
  updateUser: {
    body: {
      username: Joi.string(),
      privilege: Joi.string()
    },
    params: {
      userId: Joi.string().hex().required()
    }
  },

  // UPDATE /v1/markers/:markerId
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

  // UPDATE /v1/area/:areaId
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
      areaId: Joi.string().required()
    }
  },

  updateSingle: {
    body: {
      subEntityId: Joi.string().required(),
      nextBody: Joi.array().required()
    },
    params: {
      metadataId: Joi.string().required()
    }
  },

  updateLink: {
    body: {
      linkedItemKey1: Joi.string().required(),
      linkedItemKey2: Joi.string().required(),
      linkedItemType1: Joi.string().required(),
      linkedItemType2: Joi.string().required()
    },
    params: {
      metadataId: Joi.string().required()
    }
  },

  // POST /v1/auth/login
  login: {
    body: {
      email: Joi.string().required(),
      password: Joi.string().required()
    }
  },

  // POST /v1/auth/login
  signup: {
    body: {
      email: Joi.string().required(),
      password: Joi.string().required()
    }
  }
}
