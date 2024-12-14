import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { fileQueue } from '../worker';

/**
 * Controller for managing file-related actions.
 */
class FilesController {
  /**
   * Handles the creation and upload of files or folders.
   * @param {Object} req - The request object containing file data and user token.
   * @param {Object} res - The response object to send the status and data.
   * @returns {Object} JSON response with file details or an error message.
   */
  static async postUpload(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      // Retrieve user ID from token
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { name, type, isPublic, data } = req.body;

      // Validate required fields
      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }
      if (!data && type !== 'folder') {
        return res.status(400).json({ error: 'Missing data' });
      }

      let parentId = req.body.parentId || '0';
      if (parentId !== '0') {
        const parentFile = await dbClient.filesCollection().findOne({ _id: ObjectId(parentId) });
        if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }
      parentId = parentId !== '0' ? ObjectId(parentId) : '0';

      // Common data for the file document
      const folderData = {
        userId: ObjectId(userId),
        name,
        type,
        isPublic: isPublic || false,
        parentId,
      };

      // Handle folder creation
      if (type === 'folder') {
        const newFolder = await dbClient.filesCollection().insertOne(folderData);
        return res.status(201).json({ id: newFolder.insertedId, ...folderData });
      }

      // Prepare file storage
      const folderName = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileId = uuidv4();
      const localPath = path.join(folderName, fileId);

      await fs.promises.mkdir(folderName, { recursive: true });
      await fs.promises.writeFile(localPath, Buffer.from(data, 'base64'));

      // Insert file document into the database
      const newFile = await dbClient.filesCollection().insertOne({
        localPath,
        ...folderData,
      });

      // Queue image processing if the file type is image
      if (type === 'image') {
        fileQueue.add(
          { fileId: newFile.insertedId, userId },
          { attempts: 3, backoff: { type: 'fixed', delay: 5000 } } // Retry 3 times with a 5-second delay between attempts
        );
      }

      return res.status(201).json({ id: newFile.insertedId, ...folderData });
    } catch (error) {
      console.error('Error in postUpload:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Updates a file document to set isPublic to true.
   */
  static async putPublish(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      const file = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      await dbClient.filesCollection().updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });

      const updatedFile = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId) });
      return res.status(200).json(updatedFile);
    } catch (error) {
      console.error('Error in putPublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Updates a file document to set isPublic to false.
   */
  static async putUnpublish(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      const file = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      await dbClient.filesCollection().updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });

      const updatedFile = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId) });
      return res.status(200).json(updatedFile);
    } catch (error) {
      console.error('Error in putUnpublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Retrieves the file document based on the ID.
   */
  static async getShow(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      const file = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      return res.status(200).json(file);
    } catch (error) {
      console.error('Error in getShow:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Retrieves all file documents for the user based on parentId and pagination.
   */
  static async getIndex(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const parentId = req.query.parentId || '0';
      const page = parseInt(req.query.page, 10) || 0;
      const filesPerPage = 20;

      const query = {
        userId: ObjectId(userId),
        parentId: parentId === '0' ? '0' : ObjectId(parentId),
      };

      const files = await dbClient.filesCollection()
        .find(query)
        .skip(page * filesPerPage)
        .limit(filesPerPage)
        .toArray();

      return res.status(200).json(files);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Retrieves the content of the file document based on the ID.
   */
  static async getFile(req, res) {
    try {
      const fileId = req.params.id;
      const file = await dbClient.filesCollection().findOne({ _id: ObjectId(fileId) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      if (!file.isPublic) {
        const token = req.header('X-Token');
        const userId = token ? await redisClient.get(`auth_${token}`) : null;
        if (!userId || userId !== file.userId.toString()) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (!fs.existsSync(file.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      const fileContent = fs.readFileSync(file.localPath);

      return res.status(200).send(fileContent);
    } catch (error) {
      console.error('Error in getFile:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default FilesController;





// import { v4 as uuidv4 } from 'uuid';
// import fs from 'fs';
// import path from 'path';
// import { ObjectId } from 'mongodb';
// import mime from 'mime-types';
// import dbClient from '../utils/db';
// import redisClient from '../utils/redis';
// import { fileQueue } from '../worker';

// class FilesController {
//   static async postUpload(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });

//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

//     const {
//       name, type, isPublic, data,
//     } = req.body;

//     if (!name) return res.status(400).json({ error: 'Missing name' });
//     if (!type || !['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing type' });
//     if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

//     let parentId = req.body.parentId || '0';
//     if (parentId !== '0') {
//       const parentFile = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(parentId) });
//       if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
//       if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
//     }
//     parentId = parentId !== '0' ? ObjectId(parentId) : '0';

//     const folderData = {
//       userId: ObjectId(userId),
//       name,
//       type,
//       isPublic: isPublic || false,
//       parentId,
//     };
//     if (type === 'folder') {
//       const newFolder = await dbClient.dbClient.collection('files').insertOne({
//         userId, name, type, isPublic: isPublic || false, parentId,
//       });
//       folderData.parentId = parentId === '0' ? 0 : ObjectId(parentId);
//       return res.status(201).json({ id: newFolder.insertedId, ...folderData });
//     }

//     const folderName = process.env.FOLDER_PATH || '/tmp/files_manager';
//     const fileId = uuidv4();
//     const localPath = path.join(folderName, fileId);

//     await fs.promises.mkdir(folderName, { recursive: true });
//     await fs.promises.writeFile(path.join(folderName, fileId), Buffer.from(data, 'base64'));

//     const newFile = await dbClient.dbClient.collection('files').insertOne({ localPath, ...folderData });

//     if (type === 'image') {
//       fileQueue.add({ fileId: newFile.insertedId, userId });
//     }

//     folderData.parentId = parentId === '0' ? 0 : ObjectId(parentId);
//     return res.status(201).json({ id: newFile.insertedId, localPath, ...folderData });
//   }

//   static async getShow(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });

//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

//     const fileId = req.params.id;
//     const file = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

//     if (!file) return res.status(404).json({ error: 'Not found' });

//     return res.json(file);
//   }

//   static async getIndex(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });

//     const userIdString = await redisClient.get(`auth_${token}`);

//     if (!userIdString) return res.status(401).json({ error: 'Unauthorized' });

//     const parentId = req.query.parentId ? ObjectId(req.query.parentId) : '0';
//     const userId = ObjectId(userIdString);
//     const filesCount = await dbClient.dbClient.collection('files')
//       .countDocuments({ userId, parentId });

//     if (filesCount === '0') return res.json([]);

//     const skip = (parseInt(req.query.page, 10) || 0) * 20;
//     const files = await dbClient.dbClient.collection('files')
//       .aggregate([
//         { $match: { userId, parentId } },
//         { $skip: skip },
//         { $limit: 20 },
//       ]).toArray();

//     const modifyResult = files.map((file) => ({
//       ...file,
//       id: file._id,
//       _id: undefined,
//     }));

//     return res.json(modifyResult);
//   }

//   static async putPublish(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });

//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

//     const fileId = req.params.id;
//     const file = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
//     if (!file) return res.status(404).json({ error: 'Not found' });

//     await dbClient.dbClient.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });

//     const updatedFile = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId) });
//     return res.status(200).json(updatedFile);
//   }

//   static async putUnpublish(req, res) {
//     const token = req.header('X-Token');
//     if (!token) return res.status(401).json({ error: 'Unauthorized' });

//     const userId = await redisClient.get(`auth_${token}`);
//     if (!userId) return res.status(401).json({ error: 'Unauthorized' });

//     const fileId = req.params.id;
//     const file = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
//     if (!file) return res.status(404).json({ error: 'Not found' });

//     await dbClient.dbClient.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });

//     const updatedFile = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId) });
//     return res.status(200).json(updatedFile);
//   }

//   static async getFile(req, res) {
//     const token = req.header('X-Token');
//     const userId = await redisClient.get(`auth_${token}`);
//     const fileId = req.params.id;
//     const { size } = req.query;
//     const file = await dbClient.dbClient.collection('files').findOne({ _id: ObjectId(fileId) });
//     // file private and user not signin
//     // file private and user is sign in but not the owner
//     if (!file || (!file.isPublic && (!userId || userId !== file.userId.toString()))) {
//       return res.status(404).json({ error: 'Not found' });
//     }

//     if (file.type === 'folder') return res.status(400).json({ error: "A folder doesn't have content" });

//     let { localPath } = file;
//     if (size) localPath = `${localPath}_${size}`;

//     if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Not found' });

//     res.setHeader('Content-Type', mime.lookup(file.name));
//     return res.sendFile(localPath);
//   }
// }

// export default FilesController;
