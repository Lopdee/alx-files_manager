import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';


// Controller for handling authentication.
class AuthController {
  /**
   * Signs in the user by generating a token.
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} JSON response with the token or error.
   */

  static async getConnect(req, res) {
    try {
      // Parse the Authorization header and decode it
      const authHeader = req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const credEnc = authHeader.split(' ')[1];
      const [email, password] = Buffer.from(credEnc, 'base64').toString('ascii').split(':');
      if (!email || !password) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Find user in the database
      const user = await dbClient.db().collection('users').findOne({ email });
      if (!user || user.password !== sha1(password)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Generate token and store it in Redis
      const token = uuidv4();
      await redisClient.set(`auth_${token}`, user._id.toString(), 60 * 60 * 24);

      return res.status(200).json({ token });
    } catch (err) {
      console.error('Error in getConnect:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }


  /**
   * Signs out the user by invalidating the token.
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} JSON response or no content.
   */

  static async getDisconnect(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Delete token from Redis
      await redisClient.del(`auth_${token}`);
      return res.status(204).end();
    } catch (err) {
      console.error('Error in getDisconnect:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;



// import sha1 from 'sha1';
// import { v4 as uuidv4 } from 'uuid';
// import dbClient from '../utils/db';
// import redisClient from '../utils/redis';

// class AuthController {
//   static async getConnect(req, res) {
//     const credEnc = req.header('Authorization').split(' ')[1];
//     const [email, password] = Buffer.from(credEnc, 'base64').toString('ascii').split(':');
//     if (!email || !password) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }
//     const user = await dbClient.dbClient.collection('users').findOne({ email, password: sha1(password) });
//     if (!user || user.password !== sha1(password)) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }
//     const token = uuidv4();
//     await redisClient.set(`auth_${token}`, user._id.toString(), 60 * 60 * 24);
//     // const userIdFromRedis = await redisClient.get(`auth_${token}`);
//     // if (userIdFromRedis !== user._id.toString()) {
//     //   return res.status(500).json({ error: 'Failed to set token in Redis' });
//     // }
//     return res.status(200).json({ token });
//   }

//   static async getDisconnect(req, res) {
//     const token = req.header('X-Token');
//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     await redisClient.del(`auth_${token}`);
//     return res.status(204).end(); // end will make ;à send empty body, 204 mean no content
//   }
// }

// export default AuthController;
