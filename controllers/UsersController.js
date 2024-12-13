import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { userQueue } from '../worker';

/**
 * Controller for managing user-related actions.
 */
class UsersController {
  /**
   * Creates a new user and adds their information to the database.
   * @param {Object} req - The request object containing the user's email and password.
   * @param {Object} res - The response object to send the status and data.
   * @returns {Object} JSON response with the user ID and email or an error message.
   */
  static async postNew(req, res) {
    try {
      const { email, password } = req.body;

      // Validate request data
      if (!email) {
        return res.status(400).json({ error: 'Missing email' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Missing password' });
      }

      // Check if user already exists
      const userExists = await dbClient.usersCollection().findOne({ email });
      if (userExists) {
        return res.status(400).json({ error: 'Already exist' });
      }

      // Hash the password and insert the new user
      const hashedPassword = sha1(password);
      const result = await dbClient.usersCollection().insertOne({ email, password: hashedPassword });

      // Add the user to the worker queue for further processing
      userQueue.add({ userId: result.insertedId });

      return res.status(201).json({ id: result.insertedId, email });
    } catch (error) {
      console.error('Error in postNew:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Retrieves the authenticated user's information based on their token.
   * @param {Object} req - The request object containing the user's token in the header.
   * @param {Object} res - The response object to send the status and user data.
   * @returns {Object} JSON response with the user's email and ID or an error message.
   */
  static async getMe(req, res) {
    try {
      const token = req.header('X-Token');

      // Validate token
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Retrieve the user ID associated with the token from Redis
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Find the user in the database by their ID
      const user = await dbClient.usersCollection().findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Return the user information
      return res.status(200).json({ id: user._id, email: user.email });
    } catch (error) {
      console.error('Error in getMe:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default UsersController;


// import sha1 from 'sha1';
// import { ObjectId } from 'mongodb';
// import dbClient from '../utils/db';
// import redisClient from '../utils/redis';
// import { userQueue } from '../worker';

// class UsersController {
//   static async postNew(req, res) {
//     const { email, password } = req.body;

//     if (!email) {
//       return res.status(400).json({ error: 'Missing email' });
//     }
//     if (!password) {
//       return res.status(400).json({ error: 'Missing password' });
//     }

//     const userExists = await dbClient.dbClient.collection('users').findOne({ email });
//     if (userExists) {
//       return res.status(400).json({ error: 'Already exist' });
//     }

//     const hashedPassword = sha1(password);

//     const result = await dbClient.dbClient.collection('users').insertOne({ email, password: hashedPassword });
//     userQueue.add({ userId: result.insertedId });
//     return res.status(201).json({ id: result.insertedId, email });
//   }

//   static async getMe(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });
//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

//     const users = await dbClient.dbClient.collection('users');
//     const ObjId = new ObjectId(userId);

//     const user = await users.findOne({ _id: ObjId });
//     if (user) return res.status(200).json({ id: userId, email: user.email });
//     return res.status(401).json({ error: 'Unauthorized' });
//   }
// }

// export default UsersController;
