// schemas.js

var express = require('express'),
    PromiseRouter = require('./PromiseRouter');

var router = new PromiseRouter();

function mongoSchemaToSchemaAPIResponse(schema) {
	fieldNames = Object.keys(schema).filter(key => key !== '_id');
	return {
		className: schema._id,
		fields: fieldNames.map(name => {
			result = {};
			result[name] = {
				type: schema[name],
			};
			return result;
		}),
	};
}

function getAllSchemas(req) {
	return req.config.database.collection('_SCHEMA')
	.then(coll => coll.find({}).toArray())
	.then(schemas => ({response: {
		results: schemas.map(mongoSchemaToSchemaAPIResponse)
	}}));
}

router.route('GET', '/schemas', getAllSchemas);

module.exports = router;
