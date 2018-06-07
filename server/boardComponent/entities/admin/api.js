// controllers
import express from 'express'

const getAdminDashInfo = require('./controller').getAdminDashInfo;
const createForum = require('./controller').createForum;
const deleteForum = require('./controller').deleteForum;
const deleteUser = require('./controller').deleteUser;
const deleteDiscussion = require('./controller').deleteDiscussion;

/**
 * admin apis
 * @param  {Object} app
 */
const router = express.Router() // eslint-disable-line

  // get all info for admin dashboard
  router.route('/admin_dashboard_info').get( (req, res) => {
      getAdminDashInfo().then(
        (data) => { res.send(data); },
        (error) => { res.send(error); }
      );
  });

  // create a forum
  router.route('/create_forum').post( (req, res) => {
      const {
        title,
        slug,
      } = req.body;

      createForum({ forum_name: title, forum_slug: slug }).then(
        (data) => { res.send(data); },
        (error) => { res.send(error); }
      );
  });

  // delete a forum
  router.route('/delete_forum').post( (req, res) => {
      deleteForum(req.body).then(
        (data) => { res.send(data); },
        (error) => { res.send(error); }
      );
  });

  // delete an user
  router.route('/delete_user').post( (req, res) => {
      deleteUser(req.body).then(
        (data) => { res.send(data); },
        (error) => { res.send(error); }
      );
  });

  // delete a forum
  router.route('/delete_user').post( (req, res) => {
      deleteDiscussion(req.body).then(
        (data) => { res.send(data); },
        (error) => { res.send(error); }
      );
  });

export default router
