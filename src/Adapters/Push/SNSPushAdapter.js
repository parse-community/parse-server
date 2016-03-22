"use strict";
// SNSAdapter
//
// Uses SNS for push notification
import PushAdapter from './PushAdapter';

const Parse = require('parse/node').Parse;
const GCM = require('../../GCM');
const APNS = require('../../APNS');

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
        this.snsConfig = pushConfig.pushTypes;
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
                        break;
                    case 'android':
                        this.senderMap[pushType] = this.sendToGCM.bind(this);
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
    static generateiOSPayload(data, production) {
        var prefix = "";

        if (production) {
            prefix = "APNS";
        } else {
            prefix = "APNS_SANDBOX"
        }

        var notification = APNS.generateNotification(data.data, data.expirationTime);

        var payload = {};
        payload[prefix] = notification.compile();
        return payload;
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

        var iosPushConfig = this.snsConfig['ios'];

        let iosConfigs = [];
        if (Array.isArray(iosPushConfig)) {
            iosConfigs = iosConfigs.concat(iosPushConfig);
        } else {
            iosConfigs.push(iosPushConfig)
        }

        let promises = [];

        for (let iosConfig of iosConfigs) {

            let production = iosConfig.production || false;
            var payload = SNSPushAdapter.generateiOSPayload(data, production);

            var deviceSends = [];
            for (let device of devices) {

                // Follow the same logic as APNS service.  If no appIdentifier, send it!
                if (!device.appIdentifier || device.appIdentifier === '') {
                    deviceSends.push(device);
                }

                else if (device.appIdentifier === iosConfig.bundleId) {
                    deviceSends.push(device);
                }
            }
            if (deviceSends.length > 0) {
                promises.push(this.sendToSNS(payload, deviceSends, iosConfig.ARN));
            }
        }

        return promises;
    }

    sendToGCM(data, devices) {
        var payload = SNSPushAdapter.generateAndroidPayload(data);
        var pushConfig = this.snsConfig['android'];

        return this.sendToSNS(payload, devices, pushConfig.ARN);
    }

    sendToSNS(payload, devices, platformArn) {
        // Exchange the device token for the Amazon resource ID

        let exchangePromises = devices.map((device) => {
            return this.exchangeTokenPromise(device, platformArn);
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
    getPlatformArn(device, arn, callback) {
        var params = {
            PlatformApplicationArn: arn,
            Token: device.deviceToken
        };

        this.sns.createPlatformEndpoint(params, callback);
    }

    /**
     * Exchange the device token for an ARN
     */
    exchangeTokenPromise(device, platformARN) {
        return new Parse.Promise((resolve, reject) => {

            this.getPlatformArn(device, platformARN, (err, data) => {
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
