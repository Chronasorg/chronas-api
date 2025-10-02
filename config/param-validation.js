import Joi from 'joi'

export default {
  // POST /v1/users
  createUser: {
    body: Joi.object({
      username: Joi.string().required(),
      email: Joi.string().email(),
      password: Joi.string(),
      avatar: Joi.string(),
      bio: Joi.string(),
      website: Joi.string(),
      name: Joi.string(),
      education: Joi.string(),
      authType: Joi.string(),
      privilege: Joi.number(),
      thirdParty: Joi.boolean(),
      signup: Joi.boolean()
    })
  },

  createGame: {
    body: Joi.object({
      name: Joi.string().required()
    })
  },

  // POST /v1/markers
  createMarker: {
    body: Joi.object({
      name: Joi.string().required(),
      privilegeLevel: Joi.string().required(),
      layout: Joi.string().required()
    })
  },

  // POST /v1/areas
  createArea: {
    body: Joi.object({
      name: Joi.string().required(),
      privilegeLevel: Joi.string().required(),
      url: Joi.string().required(),
      format: Joi.string().required(),
      timeFormat: Joi.string().required(),
      dataSchema: Joi.string().required()
    })
  },

  // UPDATE /v1/users/:userId
  updateUser: {
    body: Joi.object({
      username: Joi.string(),
      privilege: Joi.string()
    }),
    params: Joi.object({
      userId: Joi.string().hex().required()
    })
  },

  // UPDATE /v1/markers/:markerId
  updateMarker: {
    body: Joi.object({
      name: Joi.string(),
      privilegeLevel: Joi.string(),
      layout: Joi.string()
    }),
    params: Joi.object({
      markerId: Joi.string().hex().required()
    })
  },

  // UPDATE /v1/area/:areaId
  updateArea: {
    body: Joi.object({
      name: Joi.string(),
      privilegeLevel: Joi.string(),
      url: Joi.string(),
      format: Joi.string(),
      timeFormat: Joi.string(),
      dataSchema: Joi.string()
    }),
    params: Joi.object({
      areaId: Joi.string().required()
    })
  },

  updateSingle: {
    body: Joi.object({
      subEntityId: Joi.string().required(),
      nextBody: Joi.array().required()
    }),
    params: Joi.object({
      metadataId: Joi.string().required()
    })
  },

  updateLink: {
    body: Joi.object({
      linkedItemKey1: Joi.string().required(),
      linkedItemKey2: Joi.string().required(),
      linkedItemType1: Joi.string().required(),
      linkedItemType2: Joi.string().required()
    }),
    params: Joi.object({
      metadataId: Joi.string().required()
    })
  },

  // POST /v1/auth/login
  login: {
    body: Joi.object({
      email: Joi.string().required(),
      password: Joi.string().required()
    })
  },

  // POST /v1/auth/signup
  signup: {
    body: Joi.object({
      email: Joi.string().required(),
      password: Joi.string().required(),
      username: Joi.string()
    })
  }
}
