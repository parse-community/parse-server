const parser = require('./OracleConfigParser');
const oracledb = require('oracledb');
const { formatQuery } = require('./QueryFormatter');

/**
 * Helper function to format pg-promise style queries to Oracle format.
 * Converts parameterized queries from pg-promise syntax to Oracle bind variable syntax.
 *
 * @param {string} query - SQL query with pg-promise style parameters ($1, $2, etc.)
 * @param {Array} params - Array of parameter values
 * @returns {Object} Object with formatted query and parameters for Oracle
 */
function formatQueryForOracle(query, params) {
  if (typeof query === 'string' && params && Array.isArray(params)) {
    return formatQuery(query, params);
  }
  return { query, params: params || [] };
}

/**
 * Creates an Oracle database client with connection pooling.
 * Returns a client object that mimics the pg-promise interface for compatibility
 * with existing Parse Server code.
 *
 * @param {string} uri - Oracle database connection URI
 * @param {Object} databaseOptions - Additional database connection options
 * @returns {Object} Object containing client (with pg-promise-like interface) and oracledb module
 * @example
 * const { client } = createClient('oracle://user:pass@localhost:1521/XE', {
 *   poolMin: 2,
 *   poolMax: 10
 * });
 */
export function createClient(uri, databaseOptions) {
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  for (const key in databaseOptions) {
    dbOptions[key] = databaseOptions[key];
  }

  // Set Oracle client options
  if (dbOptions.oracleClientOptions) {
    for (const key in dbOptions.oracleClientOptions) {
      oracledb[key] = dbOptions.oracleClientOptions[key];
    }
  }

  // Create connection pool configuration
  const poolConfig = {
    user: dbOptions.user,
    password: dbOptions.password,
    connectString: dbOptions.connectString || 
      (dbOptions.host && dbOptions.port && dbOptions.serviceName
        ? `${dbOptions.host}:${dbOptions.port}/${dbOptions.serviceName}`
        : dbOptions.host && dbOptions.port && dbOptions.sid
        ? `${dbOptions.host}:${dbOptions.port}:${dbOptions.sid}`
        : dbOptions.host),
    poolMin: dbOptions.poolMin || 0,
    poolMax: dbOptions.poolMax || 4,
    poolIncrement: dbOptions.poolIncrement || 1,
    poolTimeout: dbOptions.poolTimeout || 60,
    stmtCacheSize: dbOptions.stmtCacheSize || 30,
    externalAuth: dbOptions.externalAuth || false,
  };

  let pool = null;

  // Create a wrapper that mimics pg-promise interface
  const client = {
    async connect(options) {
      if (!pool) {
        pool = await oracledb.createPool(poolConfig);
      }
      if (options && options.direct) {
        // Direct connection (for schema notifications)
        return await oracledb.getConnection(poolConfig);
      }
      return await pool.getConnection();
    },
    async task(taskName, callback) {
      const conn = await this.connect();
      try {
        const taskContext = {
          any: async (query, params) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            return result.rows || [];
          },
          one: async (query, params, transform) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              maxRows: 1,
            });
            const row = result.rows && result.rows[0];
            return transform ? transform(row) : row;
          },
          none: async (query, params) => {
            const formatted = formatQueryForOracle(query, params);
            await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
          },
          map: async (query, params, transform) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            return (result.rows || []).map(transform);
          },
          tx: async (txName, callback) => {
            return await callback(taskContext);
          },
          batch: async (promises) => {
            return await Promise.all(promises);
          },
        };
        return await callback(taskContext);
      } finally {
        await conn.close();
      }
    },
    async any(query, params) {
      const conn = await this.connect();
      try {
        const formatted = formatQueryForOracle(query, params);
        const result = await conn.execute(formatted.query, formatted.params, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
        return result.rows || [];
      } finally {
        await conn.close();
      }
    },
    async one(query, params, transform) {
      const conn = await this.connect();
      try {
        const formatted = formatQueryForOracle(query, params);
        const result = await conn.execute(formatted.query, formatted.params, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: 1,
        });
        const row = result.rows && result.rows[0];
        return transform ? transform(row) : row;
      } finally {
        await conn.close();
      }
    },
    async none(query, params) {
      const conn = await this.connect();
      try {
        const formatted = formatQueryForOracle(query, params);
        await conn.execute(formatted.query, formatted.params, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
      } finally {
        await conn.close();
      }
    },
    async map(query, params, transform) {
      const conn = await this.connect();
      try {
        const formatted = formatQueryForOracle(query, params);
        const result = await conn.execute(formatted.query, formatted.params, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
        return (result.rows || []).map(transform);
      } finally {
        await conn.close();
      }
    },
    async tx(txName, callback) {
      const conn = await this.connect();
      try {
        const txContext = {
          any: async (query, params) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            return result.rows || [];
          },
          one: async (query, params, transform) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              maxRows: 1,
            });
            const row = result.rows && result.rows[0];
            return transform ? transform(row) : row;
          },
          none: async (query, params) => {
            const formatted = formatQueryForOracle(query, params);
            await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
          },
          map: async (query, params, transform) => {
            const formatted = formatQueryForOracle(query, params);
            const result = await conn.execute(formatted.query, formatted.params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            return (result.rows || []).map(transform);
          },
          batch: async (promises) => {
            return await Promise.all(promises);
          },
          ctx: { duration: 0 },
        };
        const result = await callback(txContext);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
      } finally {
        await conn.close();
      }
    },
    $pool: {
      get pool() {
        return pool;
      },
      async end() {
        if (pool) {
          await pool.close();
          pool = null;
        }
      },
      get ended() {
        return !pool;
      },
    },
  };

  return { client, oracledb };
}

