const general = {
  'title': 'General request schema',
  'type': 'object',
  'properties': {
    'op': {
      'type': 'string',
      'enum': ['connect', 'subscribe', 'unsubscribe', 'update']
    },
  },
};

const connect =  {
  'title': 'Connect operation schema',
  'type': 'object',
  'properties': {
    'op': 'connect',
    'applicationId': {
      'type': 'string'
    },
    'javascriptKey': {
      type: 'string'
    },
    'masterKey': {
      type: 'string'
    },
    'clientKey': {
      type: 'string'
    },
    'windowsKey': {
      type: 'string'
    },
    'restAPIKey': {
      'type': 'string'
    },
    'sessionToken': {
      'type': 'string'
    }
  },
  'required': ['op', 'applicationId'],
  "additionalProperties": false
};

const base = {
  'title': 'TITLE',
  'type': 'object',
  'properties': {
    'op': 'OP',
    'requestId': {
      'type': 'number'
    },
    'query': {
      'title': 'Query field schema',
      'type': 'object',
      'properties': {
        'className': {
          'type': 'string'
        },
        'where': {
          'type': 'object'
        },
        'fields': {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1,
          "uniqueItems": true
        }
      },
      'required': ['where', 'className'],
      'additionalProperties': false
    },
    'sessionToken': {
      'type': 'string'
    }
  },
  'required': ['op', 'requestId', 'query'],
  'additionalProperties': false
};

const subscribe = base;
subscribe['title'] = 'Subscribe operation schema';
subscribe['properties']['op'] = 'subscribe';

const update = base;
subscribe['title'] = 'Update operation schema';
subscribe['properties']['op'] = 'update';

const unsubscribe = {
  'title': 'Unsubscribe operation schema',
  'type': 'object',
  'properties': {
    'op': 'unsubscribe',
    'requestId': {
      'type': 'number'
    }
  },
  'required': ['op', 'requestId'],
  "additionalProperties": false
}

const RequestSchema = {
  'general': general,
  'connect': connect,
  'subscribe': subscribe,
  'update': update,
  'unsubscribe': unsubscribe
}

export default RequestSchema;
