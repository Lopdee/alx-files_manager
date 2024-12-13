
import envLoader from '../utils/env_loader';

const startServer = (api) => {
  try {
    envLoader();
    const port = process.env.PORT || 5000;
    const env = process.env.NODE_ENV || 'dev';
    api.listen(port, () => {
      console.log(`[${env}] API has started listening at port: ${port}`);
    });
  } catch (err) {
    console.error('Error starting the server:', err.message);
    process.exit(1);
  }
};

export default startServer;
