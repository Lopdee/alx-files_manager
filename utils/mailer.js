/* eslint-disable no-unused-vars */
import fs from 'fs';
import readline from 'readline';
import { promisify } from 'util';
import mimeMessage from 'mime-message';
import { gmail_v1 as gmailV1, google } from 'googleapis';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);


/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */


async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this URL:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        await writeFileAsync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      } catch (err) {
        reject(new Error(`Error retrieving access token: ${err.message}`));
      }
    });
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
*/

async function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    const token = await readFileAsync(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
    console.log('Client authorization successful');
    return oAuth2Client;
  } catch (err) {
    console.warn('Token not found. Starting new authorization flow.');
    return getNewToken(oAuth2Client);
  }
}

/**
 * Delivers a mail through the user's account.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {gmailV1.Schema$Message} mail The message to send.
 */

async function sendMailService(auth, mail) {
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: mail,
    });
    console.log('Message sent successfully');
  } catch (err) {
    console.error(`Error sending mail: ${err.message}`);
  }
}

/**
 * Contains routines for mail delivery with GMail.
 */
export default class Mailer {
  static async checkAuth() {
    try {
      const content = await readFileAsync('credentials.json', 'utf-8');
      const credentials = JSON.parse(content);
      await authorize(credentials);
      console.log('Auth check was successful');
    } catch (err) {
      console.error('Error during authorization:', err.message);
    }
  }

  static buildMessage(dest, subject, message) {
    const senderEmail = process.env.GMAIL_SENDER;
    if (!senderEmail) {
      throw new Error('GMAIL_SENDER environment variable is not set.');
    }

    const msgData = {
      type: 'text/html',
      encoding: 'UTF-8',
      from: senderEmail,
      to: [dest],
      date: new Date(),
      subject,
      body: message,
    };

    if (mimeMessage.validMimeMessage(msgData)) {
      const mimeMsg = mimeMessage.createMimeMessage(msgData);
      return { raw: mimeMsg.toBase64SafeString() };
    }

    throw new Error('Invalid MIME message');
  }

  static async sendMail(mail) {
    try {
      const content = await readFileAsync('credentials.json', 'utf-8');
      const credentials = JSON.parse(content);
      const auth = await authorize(credentials);
      await sendMailService(auth, mail);
    } catch (err) {
      console.error('Error sending mail:', err.message);
    }
  }
}
