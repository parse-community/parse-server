import RestWrite from './RestWrite';
import { md5Hash } from './cryptoUtils';

export default function pushStatusHandler(config) {

  let initialPromise;
  let pushStatus;
  let setInitial = function(body, where, options = {source: 'rest'}) {
    let object = {
      pushTime: (new Date()).toISOString(),
      query: JSON.stringify(where),
      payload: body.data,
      source: options.source,
      title: options.title,
      expiry: body.expiration_time,
      status: "pending",
      numSent: 0,
      pushHash: md5Hash(JSON.stringify(body.data)),
      ACL: new Parse.ACL() // lockdown!
    }
    let restWrite = new RestWrite(config, {isMaster: true},'_PushStatus',null, object);
    initialPromise = restWrite.execute().then((res) => {
      pushStatus = res.response;
      return Promise.resolve(pushStatus);
    });
    return initialPromise;
  }

  let setRunning = function() {
    return initialPromise.then(() => {
      let restWrite = new RestWrite(config, {isMaster: true}, '_PushStatus', {status:"pending", objectId: pushStatus.objectId}, {status: "running"});
      return restWrite.execute();
    })
  }

  let complete = function(results) {
    let update = {
      status: 'succeeded',
      numSent: 0,
      numFailed: 0,
    };
    if (Array.isArray(results)) {
      results.reduce((memo, result) => {
        // Cannot handle that
        if (!result.device || !result.device.deviceType) {
          return memo;
        }
        let deviceType = result.device.deviceType;
        if (result.transmitted)
        {
          memo.numSent++;
          memo.sentPerType = memo.sentPerType || {};
          memo.sentPerType[deviceType] = memo.sentPerType[deviceType] || 0;
          memo.sentPerType[deviceType]++;
        } else {
          memo.numFailed++;
          memo.failedPerType = memo.failedPerType || {};
          memo.failedPerType[deviceType] = memo.failedPerType[deviceType] || 0;
          memo.failedPerType[deviceType]++;
        }
        return memo;
      }, update);
    }

    return initialPromise.then(() => {
      let restWrite = new RestWrite(config, {isMaster: true}, '_PushStatus', {status:"running", objectId: pushStatus.objectId}, update);
      return restWrite.execute();
    })
  }

  return Object.freeze({
    setInitial,
    setRunning,
    complete
  })
}
