import PromiseRouter   from '../PromiseRouter';
import rest            from '../rest';
import archiver        from 'archiver';
import tmp             from 'tmp';
import fs from 'fs';

const DefaultExportExportProgressCollectionName = "_ExportProgress";
const relationSchema = { fields: { relatedId: { type: 'String' }, owningId: { type: 'String' } } };

export class ExportRouter extends PromiseRouter {

  exportClassPage(req, name, jsonFileStream, where, skip, limit) {

    const databaseController = req.config.database;

    const options =  {
      skip,
      limit
    };

    const findPromise = name.indexOf('_Join') === 0 ?
    databaseController.adapter.find(name, relationSchema, where, options)
    : rest.find(req.config, req.auth, name,  where, options);

    return findPromise
    .then((data) => {
      if (Array.isArray(data)) {
        data = { results : data };
      }

      if (skip && data.results.length) {
        jsonFileStream.write(',\n');
      }

      jsonFileStream.write(JSON.stringify(data.results, null, 2).substr(1).slice(0,-1));
    });
  }

  exportClass(req, data) {
    const databaseController = req.config.database;
    const tmpJsonFile = tmp.fileSync();
    const jsonFileStream = fs.createWriteStream(tmpJsonFile.name);

    jsonFileStream.write('{\n"results" : [\n');

    const findPromise = data.name.indexOf('_Join') === 0 ?
    databaseController.adapter.count(data.name, relationSchema, data.where)
    : rest.find(req.config, req.auth, data.name,  data.where, { count: true, limit: 0 });

    return findPromise
    .then((result) => {

      if (Number.isInteger(result)) {
        result = { count: result };
      }

      let i = 0;
      const pageLimit = 1000;
      let promise = Promise.resolve();


      for (i = 0; i < result.count; i += pageLimit) {

        const skip = i;
        promise = promise.then(() => {
          return this.exportClassPage(req, data.name, jsonFileStream, data.where, skip, pageLimit);
        });
      }

      return promise;
    })
    .then(() => {

      jsonFileStream.end(']\n}');

      return new Promise((resolve) => {

        jsonFileStream.on('close', () => {
          tmpJsonFile._name = `${data.name.replace(/:/g,'꞉')}.json`;

          resolve(tmpJsonFile);
        });
      })
    });
  }

  handleExportProgress(req) {

    const databaseController = req.config.database;

    const query = {
      masterKey: req.info.masterKey,
      applicationId: req.info.appId
    };

    return databaseController.find(DefaultExportExportProgressCollectionName, query)
    .then((response) => {
      return { response };
    });
  }

  handleExport(req) {
    const databaseController = req.config.database;

    const emailControllerAdapter = req.config.emailControllerAdapter;

    if (!emailControllerAdapter) {
      return Promise.reject(new Error('You have to setup a Mail Adapter.'));
    }

    const exportProgress = {
      id: req.body.name,
      masterKey: req.info.masterKey,
      applicationId: req.info.appId
    };

    databaseController.create(DefaultExportExportProgressCollectionName, exportProgress)
    .then(() => {
      return databaseController.loadSchema({ clearCache: true});
    })
    .then(schemaController => schemaController.getOneSchema(req.body.name, true))
    .then((schema) => {
      const classNames = [ req.body.name ];
      const where = req.body.where;
      Object.keys(schema.fields).forEach((fieldName) => {
        const field = schema.fields[fieldName];

        if (field.type === 'Relation') {
          classNames.push(`_Join:${fieldName}:${req.body.name}`);
        }
      });

      const promisses = classNames.map((name) => {
        return this.exportClass(req, {
          name,
          where,
        });
      });

      return Promise.all(promisses)
    })
    .then((jsonFiles) => {

      return new Promise((resolve) => {
        const tmpZipFile = tmp.fileSync();
        const tmpZipStream = fs.createWriteStream(tmpZipFile.name);

        const zip  = archiver('zip');
        zip.pipe(tmpZipStream);

        jsonFiles.forEach(tmpJsonFile => {
          zip.append(fs.readFileSync(tmpJsonFile.name), { name:  tmpJsonFile._name });
          tmpJsonFile.removeCallback();
        });

        zip.finalize();

        tmpZipStream.on('close', () => {

          const buf = fs.readFileSync(tmpZipFile.name);
          tmpZipFile.removeCallback();
          resolve(buf);

        });
      });

    })
    .then((zippedFile) => {
      const filesController = req.config.filesController;
      return filesController.createFile(req.config, req.body.name, zippedFile, 'application/zip');
    })
    .then((fileData) => {

      return emailControllerAdapter.sendMail({
        text: `We have successfully exported your data from the class ${req.body.name}.\n
        Please download from ${fileData.url}`,
        link: fileData.url,
        to: req.body.feedbackEmail,
        subject: 'Export completed'
      });
    })
    .catch((error) => {
      return emailControllerAdapter.sendMail({
        text: `We could not export your data to the class ${req.body.name}. Error: ${error}`,
        to: req.body.feedbackEmail,
        subject: 'Export failed'
      });
    })
    .then(() => {
      return databaseController.destroy(DefaultExportExportProgressCollectionName, exportProgress);
    });

    return Promise.resolve({response: 'We are exporting your data. You will be notified by e-mail once it is completed.'});
  }

  mountRoutes() {
    this.route(
      'PUT',
      '/export_data',
      (req) => { return this.handleExport(req); }
    );

    this.route(
      'GET',
      '/export_progress',
      (req) => { return this.handleExportProgress(req); }
    );

  }
}

export default ExportRouter;
