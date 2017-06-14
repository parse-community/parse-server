import express          from 'express';
import * as middlewares from '../middlewares';
import multer           from 'multer';
import rest             from '../rest';
import { Parse }        from 'parse/node';

export class ImportRouter {

  getOneSchema(req) {

    const className = req.params.className;

    return req.config.database.loadSchema({clearCache: true})
    .then(schemaController => schemaController.getOneSchema(className))
    .catch(error => {
      if (error === undefined) {
        return Promise.reject(new Parse.Error(Parse.Error.INVALID_CLASS_NAME,
        `Class ${className} does not exist.`));
      } else {
        return Promise.reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR,
        'Database adapter error.'));
      }
    });
  }

  importRestObject(req, restObject, targetClass) {

    if (targetClass) {
      return rest.update(req.config, req.auth, req.params.className, restObject.owningId, {
        [req.params.relationName]: {
          "__op": "AddRelation",
          "objects": [{"__type": "Pointer", "className": targetClass, "objectId": restObject.relatedId}]
        }
      }, req.info.clientSDK)
      .catch(function (error) {
        if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
          return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found'));
        } else {
          return Promise.reject(error);
        }
      });
    }

    if (restObject.createdAt) {
      delete restObject.createdAt;
    }

    if (restObject.updatedAt) {
      delete restObject.updatedAt;
    }

    if (restObject.objectId) {
      return rest
      .update(req.config, req.auth, req.params.className, restObject.objectId, restObject)
      .catch(function (error) {
        if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
          return rest.create(
            req.config,
            req.auth,
            req.params.className,
            restObject,
            req.info.clientSDK,
            {allowObjectId: true}
          );
        } else {
          return Promise.reject(error);
        }
      });
    }

    return rest.create(req.config, req.auth, req.params.className, restObject);
  }

  getRestObjects(req) {
    return new Promise((resolve) => {

      let restObjects = [];
      let importFile;

      try {
        importFile = JSON.parse(req.file.buffer.toString());
      } catch (e) {
        throw new Error('Failed to parse JSON based on the file sent');
      }

      if (Array.isArray(importFile)) {
        restObjects = importFile;
      } else if (Array.isArray(importFile.results)) {
        restObjects = importFile.results;
      } else if (Array.isArray(importFile.rows)) {
        restObjects = importFile.rows;
      }

      if (!restObjects) {
        throw new Error('No data to import');
      }

      if (req.body.feedbackEmail) {
        if (!req.config.emailControllerAdapter) {
          throw new Error('You have to setup a Mail Adapter.');
        }
      }

      resolve(restObjects);
    });
  }

  handleImport(req) {

    let promise = null;

    if (req.params.relationName) {
      promise = this.getOneSchema(req)
      .then((response) => {
        if (!response.fields.hasOwnProperty(req.params.relationName)) {
          throw new Error(`Relation ${req.params.relationName} does not exist in ${req.params.className}.`);
        } else if (response.fields[req.params.relationName].type !== 'Relation') {
          throw new Error(`Class ${response.fields[req.params.relationName].targetClass} does not have Relation type.`);
        }

        const targetClass = response.fields[req.params.relationName].targetClass;

        return Promise.all([this.getRestObjects(req), targetClass]);
      });
    }
    else {
      promise = Promise.all([this.getRestObjects(req)]);
    }

    promise = promise
    .then(([restObjects, targetClass]) => {

      return restObjects.reduce((item, object, index) => {

        item.pageArray.push(this.importRestObject.bind(this, req, object, targetClass));

        if (index && index % 100 === 0 || index === (restObjects.length - 1)) {

          const pageArray = item.pageArray.slice(0);
          item.pageArray = [];

          item.mainPromise = item.mainPromise
          .then((results) => {
            return Promise.all(results.concat(pageArray.map(func => func())));
          });

        }

        return item;
      }, { pageArray: [], mainPromise : Promise.resolve([]) }).mainPromise;
    })
    .then((results) => {

      if (req.body.feedbackEmail) {
        req.config.emailControllerAdapter.sendMail({
          text: `We have successfully imported your data to the class ${req.params.className}${req.params.relationName ? ', relation ' + req.params.relationName : '' }.`,
          to: req.body.feedbackEmail,
          subject: 'Import completed'
        });
      } else {
        return Promise.resolve({ response: results });
      }
    })
    .catch((error) => {
      if (req.body.feedbackEmail) {
        req.config.emailControllerAdapter.sendMail({
          text: `We could not import your data to the class ${req.params.className}${req.params.relationName ? ', relation ' + req.params.relationName : '' }. Error: ${error}`,
          to: req.body.feedbackEmail,
          subject: 'Import failed'
        });
      } else {
        throw new Error(`Internal server error: ${error}`);
      }

    });

    if (req.body.feedbackEmail && req.config.emailControllerAdapter) {
      promise = Promise.resolve({ response: 'We are importing your data. You will be notified by e-mail once it is completed.' });
    }

    return promise;
  }

  wrapPromiseRequest(req, res, handler) {
    return handler(req)
    .then((data) => {
      res.json(data);
    })
    .catch((err) => {
      res.status(400).send({ message: err.message });
    })
  }

  expressRouter() {
    const router = express.Router();
    const upload = multer();

    router.post('/import_data/:className',
      upload.single('importFile'),
      middlewares.allowCrossDomain,
      middlewares.handleParseHeaders,
      middlewares.enforceMasterKeyAccess,
      (req, res) => this.wrapPromiseRequest(req, res, this.handleImport.bind(this))
    );

    router.post('/import_relation_data/:className/:relationName',
      upload.single('importFile'),
      middlewares.allowCrossDomain,
      middlewares.handleParseHeaders,
      middlewares.enforceMasterKeyAccess,
      (req, res) => this.wrapPromiseRequest(req, res, this.handleImport.bind(this))
    );

    return router;
  }
}

export default ImportRouter;
