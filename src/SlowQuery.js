import { performance } from 'perf_hooks';
import logger from './logger';
import rest from './rest';
import auth from './Auth';

export const registerSlowQueryListener = (app, options) => {
  const slowQueryOptions = options.slowQuery;
  app.use((req, res, next) => {
    const startTime = performance.now();
    res.on('finish', async () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const config = req.config;
      if (duration > (options.slowQuery.threshold ?? 3000)) {
        if (slowQueryOptions?.log) {
          logger.warn(
            `Detected a slow query on path ${req.path}. Duration: ${duration.toFixed(0)}ms`
          );
        }
        try {
          await rest.create(config, auth.master(config), '_SlowQuery', {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
            duration,
          });
        } catch (e) {
          logger.error('Could not save Slow Query object.');
        }
      }
    });
    next();
  });
};
