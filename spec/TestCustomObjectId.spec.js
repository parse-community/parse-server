'use strict';
const Parse = require('parse/node');
const moment = require('moment');

describe('Test Custom ObjectId', () => {
  it('object not found ', async () => {
    Parse.initialize('debug_appid', 'debug_key', 'debug_masterKey');
    Parse.serverURL = 'http://localhost:1337/parse';

    const body = {
      name: 'SaveAudio',
      data: '{"__after":"1716788669509,2cf6e3698932972402fa3ca2405b437dc3ac727a","isDeleted":false,"name":"好的呢，宝宝","duration":2,"url":"http://file2.i7play.com/FdD9KwF4xNgBHTiGcJByMNs6P470XNFp/20240405195209.mp3","user":{"__type":"Pointer","className":"_User","objectId":"65de1d08caa7af401d105a56"},"pack":{"__type":"Pointer","className":"SaveAudioPack","objectId":"65e9fcec4567a26864d47d2b"},"objectId":"66541dbdffead844f1339e3c","createdAt":"2024-05-27T05:44:29.504Z","updatedAt":"2024-05-27T05:44:29.504Z"}',
    };
    const name = body.name;
    const data = JSON.parse(body.data);

    const testObject = new Parse.Object(name);
    testObject.id = data.objectId;

    const entries = Object.entries(data);
    const map = [];
    for (let i = 0; i < entries.length; i++) {
      map.push({
        key: entries[i][0],
        value: entries[i][1],
      });
    }

    for (let i = 0; i < map.length; i++) {
      const key = map[i].key;
      const value = map[i].value;
      if (key === '__after') {
        continue;
      }

      if (key === 'createdAt' || key === 'updatedAt') {
        testObject.set(key, moment(value).toDate());
        continue;
      }

      //处理Pointer
      if (typeof value === 'object' && value.__type === 'Pointer') {
        let className = value.className;
        if (className === '_File') {
          className = 'AVFile';
        }
        const InnerObject = Parse.Object.extend(className);
        testObject.set(key, InnerObject.createWithoutData(value.objectId));
      } else {
        testObject.set(key, value);
      }
    }

    console.log(testObject.toJSON());
    await testObject.save(null, { useMasterKey: true });
  });
});

