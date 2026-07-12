'use strict';

const { MongoClient } = require('mongodb');
const MongoCollection = require('../lib/Adapters/Storage/Mongo/MongoCollection').default;
const { findGeoIndexField } = require('../lib/Adapters/Storage/Mongo/MongoCollection');

describe_only_db('mongo')('MongoCollection', () => {
  describe('findGeoIndexField', () => {
    it('extracts the field constrained by $nearSphere', () => {
      const query = { construct: 'line', location: { $nearSphere: [-121.5, 38.5], $maxDistance: 2.5 } };
      expect(findGeoIndexField(query)).toBe('location');
    });

    it('extracts the field constrained by $near', () => {
      expect(findGeoIndexField({ region: { $near: [0, 0] } })).toBe('region');
    });

    it('recurses into $and to find the geo field', () => {
      const query = { $and: [{ a: 1 }, { loc: { $nearSphere: [0, 0] } }] };
      expect(findGeoIndexField(query)).toBe('loc');
    });

    it('returns undefined when there is no geo operator', () => {
      expect(findGeoIndexField({ a: 1, b: { $gt: 2 } })).toBeUndefined();
    });

    it('returns undefined for empty / non-object queries', () => {
      expect(findGeoIndexField({})).toBeUndefined();
      expect(findGeoIndexField(null)).toBeUndefined();
      expect(findGeoIndexField(undefined)).toBeUndefined();
    });

    it('does not treat $geoWithin as requiring an index', () => {
      const query = { location: { $geoWithin: { $centerSphere: [[0, 0], 1] } } };
      expect(findGeoIndexField(query)).toBeUndefined();
    });

    it('does not recurse into $or (MongoDB forbids $near inside $or)', () => {
      const query = { $or: [{ a: 1 }, { loc: { $nearSphere: [0, 0] } }] };
      expect(findGeoIndexField(query)).toBeUndefined();
    });
  });

  describe('lazy geo index creation', () => {
    const collectionName = 'MongoCollectionLazyGeoIndexTest';
    let client;
    let rawCollection;

    const geoQuery = { location: { $nearSphere: [-121.5, 38.5], $maxDistance: 2.526 } };

    beforeEach(async () => {
      client = new MongoClient(databaseURI);
      await client.connect();
      rawCollection = client.db().collection(collectionName);
      // Start from a clean collection with NO geo index so the lazy-creation path is exercised.
      await rawCollection.drop().catch(() => {});
      await rawCollection.insertMany([
        { _id: '1', location: [-121, 38] },
        { _id: '2', location: [-122, 39] },
      ]);
    });

    afterEach(async () => {
      await rawCollection.drop().catch(() => {});
      await client.close();
    });

    it('creates a 2d index on demand and returns results for a $nearSphere query on an un-indexed field', async () => {
      const mongoCollection = new MongoCollection(rawCollection);
      const results = await mongoCollection.find(geoQuery);
      expect(results.length).toBe(2);
      const indexes = await rawCollection.indexes();
      const hasGeoIndex = indexes.some(index => index.key && index.key.location === '2d');
      expect(hasGeoIndex).toBe(true);
    });

    it_only_mongodb_version('>=8.3')('MongoDB 8.3+ reports the geoNear "no index" error without the field name', async () => {
      let error;
      try {
        await rawCollection.find(geoQuery).toArray();
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toMatch(/unable to find index for .geoNear/);
      expect(error.message).not.toMatch(/field=/);
    });

    it_only_mongodb_version('<8.3')('older MongoDB reports the geoNear "no index" error with the field name', async () => {
      let error;
      try {
        await rawCollection.find(geoQuery).toArray();
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(error.message).toMatch(/unable to find index for .geoNear/);
      expect(error.message).toMatch(/field=location/);
    });
  });
});
