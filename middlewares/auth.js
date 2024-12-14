/* eslint-disable no-unused-vars */
import { getUserFromXToken, getUserFromAuthorization } from '../utils/auth';

/**
 * Applies Basic authentication to a route.
 * @param {Request} req The Express request object.
 * @param {Response} res The Express response object.
 * @param {NextFunction} next The Express next function.
 */
export const basicAuthenticate = async (req, res, next) => {
  try {
    const user = await getUserFromAuthorization(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Applies X-Token authentication to a route.
 * @param {Request} req The Express request object.
 * @param {Response} res The Express response object.
 * @param {NextFunction} next The Express next function.
 */
export const xTokenAuthenticate = async (req, res, next) => {
  try {
    const user = await getUserFromXToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
