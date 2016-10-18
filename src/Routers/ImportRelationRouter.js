import PromiseRouter    from '../PromiseRouter';
import * as middleware  from '../middlewares';
import rest             from '../rest';

export class ImportRelationRouter extends PromiseRouter {
  handleImportRelation(req) {

    function getOneSchema() {
      let className = req.params.className;
      return req.config.database.loadSchema({clearCache: true})
        .then(schemaController => schemaController.getOneSchema(className))
        .catch(error => {
          if (error === undefined) {
            throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
          } else {
            throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
          }
        });
    }

    return getOneSchema().then((response) => {

      if (!response.fields.hasOwnProperty(req.params.relationName)) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Relation ${req.params.relationName} does not exist in ${req.params.className}.`);
      } else if(response.fields[req.params.relationName].type !== 'Relation') {
        throw new Parse.Error(Parse.Error.INVALID_TYPE, `Class ${response.fields[req.params.relationName].targetClass} does not have Relation type.`);
      }

      let targetClass = response.fields[req.params.relationName].targetClass;
      let promises = [];
      let restObjects = [];

      if (Array.isArray(req.body)) {
        restObjects = req.body;
      } else if (Array.isArray(req.body.results)) {
        restObjects = req.body.results;
      }

      restObjects.forEach((restObjects) => {
        promises.push(
          rest.update(req.config, req.auth, req.params.className, restObjects.owningId, {[req.params.relationName]: {"__op": "AddRelation", "objects": [{"__type": "Pointer", "className": targetClass, "objectId": restObjects.relatedId}]}}, req.info.clientSDK)
            .catch(function (error) {
              throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found');
            })
        )
      });

      return Promise.all(promises).then((results) => {
        return {response: results};
      });
    });
  }

  mountRoutes() {
    this.route(
      'POST',
      '/import/:className/:relationName',
      middleware.promiseEnforceMasterKeyAccess,
      (req) => { return this.handleImportRelation(req); }
    );
  }
}

export default ImportRelationRouter;