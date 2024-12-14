import express from 'express';

/**
 * Adds middlewares to the given express application.
 * @param {express.Express} api The express application.
 */
const injectMiddlewares = (api) => {
  api.use(express.json({ limit: '200mb' }));
  api.use(express.urlencoded({ extended: true }));
};

export default injectMiddlewares;
