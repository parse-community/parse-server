const MongoClient = require('mongodb').MongoClient;
const GridStore = require('mongodb').GridStore;

const GridStoreAdapter = require('../lib/Adapters/Files/GridStoreAdapter')
  .GridStoreAdapter;
const Config = require('../lib/Config');
const FilesController = require('../lib/Controllers/FilesController').default;

// Small additional tests to improve overall coverage
describe_only_db('mongo')('GridStoreAdapter', () => {
  it('should properly instanciate the GridStore when deleting a file', async done => {
    const databaseURI = 'mongodb://localhost:27017/parse';
    const config = Config.get(Parse.applicationId);
    const gridStoreAdapter = new GridStoreAdapter(databaseURI);
    const db = await gridStoreAdapter._connect();
    await db.dropDatabase();
    const filesController = new FilesController(
      gridStoreAdapter,
      Parse.applicationId,
      {}
    );

    // save original unlink before redefinition
    const originalUnlink = GridStore.prototype.unlink;

    let gridStoreMode;

    // new unlink method that will capture the mode in which GridStore was opened
    GridStore.prototype.unlink = function() {
      // restore original unlink during first call
      GridStore.prototype.unlink = originalUnlink;

      gridStoreMode = this.mode;

      return originalUnlink.call(this);
    };

    filesController
      .createFile(config, 'myFilename.txt', 'my file content', 'text/plain')
      .then(myFile => {
        return MongoClient.connect(databaseURI)
          .then(client => {
            const database = client.db(client.s.options.dbName);
            // Verify the existance of the fs.files document
            return database
              .collection('fs.files')
              .count()
              .then(count => {
                expect(count).toEqual(1);
                return { database, client };
              });
          })
          .then(({ database, client }) => {
            // Verify the existance of the fs.files document
            return database
              .collection('fs.chunks')
              .count()
              .then(count => {
                expect(count).toEqual(1);
                return client.close();
              });
          })
          .then(() => {
            return filesController.deleteFile(config, myFile.name);
          });
      })
      .then(() => {
        return MongoClient.connect(databaseURI)
          .then(client => {
            const database = client.db(client.s.options.dbName);
            // Verify the existance of the fs.files document
            return database
              .collection('fs.files')
              .count()
              .then(count => {
                expect(count).toEqual(0);
                return { database, client };
              });
          })
          .then(({ database, client }) => {
            // Verify the existance of the fs.files document
            return database
              .collection('fs.chunks')
              .count()
              .then(count => {
                expect(count).toEqual(0);
                return client.close();
              });
          });
      })
      .then(() => {
        // Verify that gridStore was opened in read only mode
        expect(gridStoreMode).toEqual('r');

        done();
      })
      .catch(fail);
  });

  it('handleShutdown, close connection', done => {
    const databaseURI = 'mongodb://localhost:27017/parse';
    const gridStoreAdapter = new GridStoreAdapter(databaseURI);

    gridStoreAdapter._connect().then(db => {
      expect(db.serverConfig.connections().length > 0).toEqual(true);
      expect(db.serverConfig.s.connected).toEqual(true);
      gridStoreAdapter.handleShutdown().then(() => {
        expect(db.serverConfig.connections().length > 0).toEqual(false);
        expect(db.serverConfig.s.connected).toEqual(false);
        done();
      });
    });
  });
});
