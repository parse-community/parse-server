"use strict";
// SNSAdapter
//
// Uses SNS for push notification
import PushAdapter from './PushAdapter';

const Parse = require('parse/node').Parse;
const GCM = require('../../GCM');

const AWS = require('aws-sdk');

var DEFAULT_REGION = "us-east-1";
import { classifyInstallations } from './PushAdapterUtils';

export class SNSPushAdapter extends PushAdapter {

    // Publish to an SNS endpoint
    // Providing AWS access and secret keys is mandatory
    // Region will use sane defaults if omitted
    constructor(pushConfig = {}) {
        super(pushConfig);
        this.validPushTypes = ['ios', 'android'];
        this.availablePushTypes = [];
        this.arnMap = {};
        this.senderMap = {};

        if (!pushConfig.accessKey || !pushConfig.secretKey) {
            throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                'Need to provide AWS keys');
        }

        if (pushConfig.pushTypes) {
            let pushTypes = Object.keys(pushConfig.pushTypes);
            for (let pushType of pushTypes) {
                if (this.validPushTypes.indexOf(pushType) < 0) {
                    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                        'Push to ' + pushTypes + ' is not supported');
                }
                this.availablePushTypes.push(pushType);
                switch (pushType) {
                    case 'ios':
                        this.senderMap[pushType] = this.sendToAPNS.bind(this);
                        this.arnMap[pushType] = pushConfig.pushTypes[pushType];
                        break;
                    case 'android':
                        this.senderMap[pushType] = this.sendToGCM.bind(this);
                        this.arnMap[pushType] = pushConfig.pushTypes[pushType];
                        break;
                }
            }
        }

        AWS.config.update({
            accessKeyId: pushConfig.accessKey,
            secretAccessKey: pushConfig.secretKey,
            region: pushConfig.region || DEFAULT_REGION
        });

        // Instantiate after config is setup.
        this.sns = new AWS.SNS();
    }

    getValidPushTypes() {
        return this.availablePushTypes;
    }

    static classifyInstallations(installations, validTypes) {
        return classifyInstallations(installations, validTypes)
    }

    //Generate proper json for APNS message
    static generateiOSPayload(data) {
        return {
            'APNS': JSON.stringify(data)
        };
    }

    // Generate proper json for GCM message
    static generateAndroidPayload(data, pushId, timeStamp) {
        var payload = GCM.generateGCMPayload(data.data, pushId, timeStamp, data.expirationTime);

        // SNS is verify sensitive to the body being JSON stringified but not GCM key.
        return {
            'GCM': JSON.stringify(payload)
        };
    }

    sendToAPNS(data, devices) {
        var payload = SNSPushAdapter.generateiOSPayload(data);

        return this.sendToSNS(payload, devices, 'ios');
    }

    sendToGCM(data, devices) {
        var payload = SNSPushAdapter.generateAndroidPayload(data);
        return this.sendToSNS(payload, devices, 'android');
    }

    sendToSNS(payload, devices, pushType) {
        // Exchange the device token for the Amazon resource ID
        let exchangePromises = devices.map((device) => {
            return this.exchangeTokenPromise(device, pushType);
        });

        // Publish off to SNS!
        // Bulk publishing is not yet supported on Amazon SNS.
        let promises = Parse.Promise.when(exchangePromises).then(arns => {
            arns.map((arn) => {
                return this.sendSNSPayload(arn, payload);
            });
        });

        return promises;
    }


    /**
     * Request a Amazon Resource Identifier if one is not set.
     */
    getPlatformArn(device, pushType, callback) {
        var params = {
            PlatformApplicationArn: this.arnMap[pushType],
            Token: device.deviceToken
        };

        this.sns.createPlatformEndpoint(params, callback);
    }

    /**
     * Exchange the device token for an ARN
     */
    exchangeTokenPromise(device, pushType) {
        return new Parse.Promise((resolve, reject) => {
            this.getPlatformArn(device, pushType, (err, data) => {
                if (data.EndpointArn) {
                    resolve(data.EndpointArn);
                } else {
                    console.error(err);
                    reject(err);
                }
            });
        });
    }

    /**
     * Send the Message, MessageStructure, and Target Amazon Resource Number (ARN) to SNS
     * @param arn Amazon Resource ID
     * @param payload JSON-encoded message
     * @returns {Parse.Promise}
     */
    sendSNSPayload(arn, payload) {

        var object = {
            Message: JSON.stringify(payload),
            MessageStructure: 'json',
            TargetArn: arn
        };

        return new Parse.Promise((resolve, reject) => {
            this.sns.publish(object, (err, data) => {
                if (err != null) {
                    console.error("Error sending push " + err);
                    return reject(err);
                }
                resolve(object);
            });
        });
    }

    // For a given config object, endpoint and payload, publish via SNS
    // Returns a promise containing the SNS object publish response
    send(data, installations) {
        let deviceMap = classifyInstallations(installations, this.availablePushTypes);

        let sendPromises = Object.keys(deviceMap).forEach((pushType) => {
            var devices = deviceMap[pushType];
            var sender = this.senderMap[pushType];
            return sender(data, devices);
        });

        return Parse.Promise.when(sendPromises);
    }
}

export default SNSPushAdapter;
module.exports = SNSPushAdapter;
