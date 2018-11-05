import User from '../models/user.model'
import logger from '../../config/winston'
import APIError from '../helpers/APIError'
import { config } from '../../config/config'
import jwt from 'jsonwebtoken'
import httpStatus from "http-status";

/**
 * get current deployed version
 * @returns {User}
 */
function get(req, res) {
  return res.json({ version: "1.1.1" })
}

export default { get }
