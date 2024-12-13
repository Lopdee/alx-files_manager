import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(req, res) {
    try {
      const redisLive = redisClient.isAlive();
      const dbLive = dbClient.isAlive();
      res.status(200).json({ redis: redisLive, db: dbLive });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  }

  static async getStats(req, res) {
    try {
      const usersTotal = await dbClient.nbUsers();
      const filesTotal = await dbClient.nbFiles();
      res.status(200).json({ users: usersTotal, files: filesTotal });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }
}

export default AppController;
