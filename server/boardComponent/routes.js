/**
 * module dependencies for routes configuration
 */

import path from 'path';

import express from 'express';

import userRoutes from './entities/user/api.js';
import forumRoutes from './entities/forum/api.js';
import discussionRoutes from './entities/discussion/api.js';
import opinionRoutes from './entities/opinion/api.js';
import adminRoutes from './entities/admin/api.js';

const routesConfig = (app) => {
  // mount user routes at /users
  app.use('/board/user', userRoutes);

  // mount forum routes at /forum
  app.use('/board/forum', forumRoutes);

  // mount discussion routes at /discussion
  app.use('/board/discussion', discussionRoutes);

  // mount opinion routes at /opinion
  app.use('/board/opinion', opinionRoutes);

  // mount admin routes at /admin
  app.use('/board/admin', adminRoutes);
};

export default routesConfig;
