import { existsSync, readFileSync } from 'fs';

/**
 * Loads environment variables from a file based on the current environment.
 * Defaults to `.env` or `.env.test` for testing environments.
 */
const envLoader = () => {
  try {
    const env = process.env.npm_lifecycle_event || 'dev';
    const envFilePath = env.includes('test') || env.includes('cover') ? '.env.test' : '.env';

    if (existsSync(envFilePath)) {
      const fileContent = readFileSync(envFilePath, 'utf-8').trim();

      fileContent.split('\n').forEach((line) => {
        if (!line || line.startsWith('#')) return; // Skip empty lines or comments

        const delimPosition = line.indexOf('=');
        if (delimPosition === -1) {
          console.warn(`Skipping invalid line in ${envFilePath}: "${line}"`);
          return;
        }

        const variable = line.substring(0, delimPosition).trim();
        const value = line.substring(delimPosition + 1).trim();

        if (variable) {
          process.env[variable] = value;
        } else {
          console.warn(`Skipping invalid variable definition in ${envFilePath}: "${line}"`);
        }
      });
    } else {
      console.warn(`Environment file not found: ${envFilePath}`);
    }
  } catch (err) {
    console.error(`Error loading environment variables: ${err.message}`);
  }
};

export default envLoader;
