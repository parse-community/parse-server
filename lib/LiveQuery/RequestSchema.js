'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var general = {
  'title': 'General request schema',
  'type': 'object',
  'properties': {
    'op': {
      'type': 'string',
      'enum': ['connect', 'subscribe', 'unsubscribe', 'update']
    }
  }
};

var connect = {
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

var subscribe = {
  'title': 'Subscribe operation schema',
  'type': 'object',
  'properties': {
    'op': 'subscribe',
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

var update = {
  'title': 'Update operation schema',
  'type': 'object',
  'properties': {
    'op': 'update',
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

var unsubscribe = {
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
};

var RequestSchema = {
  'general': general,
  'connect': connect,
  'subscribe': subscribe,
  'update': update,
  'unsubscribe': unsubscribe
};

exports.default = RequestSchema;