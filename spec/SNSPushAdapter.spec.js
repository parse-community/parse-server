var SNSPushAdapter = require('../src/Adapters/Push/SNSPushAdapter');
describe('SNSPushAdapter', () => {

    var pushConfig;
    var snsPushAdapter;

    beforeEach(function() {
        pushConfig = {
            pushTypes: {
                ios: "APNS_ID",
                android: "GCM_ID"
            },
            accessKey: "accessKey",
            secretKey: "secretKey",
            region: "region"
        };
        snsPushAdapter = new SNSPushAdapter(pushConfig);
    });

    it('can be initialized', (done) => {
        // Make mock config
        var arnMap = snsPushAdapter.arnMap;

        expect(arnMap.ios).toEqual("APNS_ID");
        expect(arnMap.android).toEqual("GCM_ID");

        done();
    });

    it('can get valid push types', (done) => {
        expect(snsPushAdapter.getValidPushTypes()).toEqual(['ios', 'android']);
        done();
    });

    it('can classify installation', (done) => {
        // Mock installations
        var validPushTypes = ['ios', 'android'];
        var installations = [
            {
                deviceType: 'android',
                deviceToken: 'androidToken'
            },
            {
                deviceType: 'ios',
                deviceToken: 'iosToken'
            },
            {
                deviceType: 'win',
                deviceToken: 'winToken'
            },
            {
                deviceType: 'android',
                deviceToken: undefined
            }
        ];
        var deviceMap = SNSPushAdapter.classifyInstallations(installations, validPushTypes);
        expect(deviceMap['android']).toEqual([makeDevice('androidToken')]);
        expect(deviceMap['ios']).toEqual([makeDevice('iosToken')]);
        expect(deviceMap['win']).toBe(undefined);
        done();
    });

    it('can send push notifications', (done) => {
        // Mock SNS sender
        var snsSender = jasmine.createSpyObj('sns', ['createPlatformEndpoint', 'publish']);
        snsPushAdapter.sns = snsSender;

        // Mock android ios senders
        var androidSender = jasmine.createSpy('send')
        var iosSender = jasmine.createSpy('send')

        var senderMap = {
            ios: iosSender,
            android: androidSender
        };
        snsPushAdapter.senderMap = senderMap;

        // Mock installations
        var installations = [
            {
                deviceType: 'android',
                deviceToken: 'androidToken'
            },
            {
                deviceType: 'ios',
                deviceToken: 'iosToken'
            },
            {
                deviceType: 'win',
                deviceToken: 'winToken'
            },
            {
                deviceType: 'android',
                deviceToken: undefined
            }
        ];
        var data = {};

        snsPushAdapter.send(data, installations);
        // Check SNS sender
        expect(androidSender).toHaveBeenCalled();
        var args = androidSender.calls.first().args;
        expect(args[0]).toEqual(data);
        expect(args[1]).toEqual([
            makeDevice('androidToken')
        ]);
        // Check ios sender
        expect(iosSender).toHaveBeenCalled();
        args = iosSender.calls.first().args;
        expect(args[0]).toEqual(data);
        expect(args[1]).toEqual([
            makeDevice('iosToken')
        ]);
        done();
    });

    it('can generate the right Android payload', (done) => {
        var data = {"action": "com.example.UPDATE_STATUS"};
        var pushId = '123';
        var timeStamp = 1456728000;

        var returnedData = SNSPushAdapter.generateAndroidPayload(data, pushId, timeStamp);
        var expectedData = {GCM: '{"priority":"normal","data":{"time":"1970-01-17T20:38:48.000Z","push_id":"123"}}'};
        expect(returnedData).toEqual(expectedData)
        done();
    });

    it('can generate the right iOS payload', (done) => {
        var data = {"aps": {"alert": "Check out these awesome deals!"}};
        var pushId = '123';
        var timeStamp = 1456728000;

        var returnedData = SNSPushAdapter.generateiOSPayload(data);
        var expectedData = {APNS: '{"aps":{"alert":"Check out these awesome deals!"}}'};
        expect(returnedData).toEqual(expectedData)
        done();
    });

    it('can exchange device tokens for an Amazon Resource Number (ARN)', (done) => {
        // Mock out Amazon SNS token exchange
        var snsSender = jasmine.createSpyObj('sns', ['createPlatformEndpoint']);
        snsPushAdapter.sns = snsSender;

        // Mock installations
        var installations = [
            {
                deviceType: 'android',
                deviceToken: 'androidToken'
            }
        ];

        snsSender.createPlatformEndpoint.and.callFake(function(object, callback) {
            callback(null, {'EndpointArn' : 'ARN'});
        });

        var promise = snsPushAdapter.exchangeTokenPromise(makeDevice("androidToken"), "android");

        promise.then(function() {
            expect(snsSender.createPlatformEndpoint).toHaveBeenCalled();
            args = snsSender.createPlatformEndpoint.calls.first().args;
            expect(args[0].PlatformApplicationArn).toEqual("GCM_ID");
            expect(args[0].Token).toEqual("androidToken");
            done();
        });
    });

    it('can send SNS Payload', (done) => {
        // Mock out Amazon SNS token exchange
        var snsSender = jasmine.createSpyObj('sns', ['publish'])
        snsSender.publish.and.callFake(function (object, callback) {
            callback(null, '123');
        });

        snsPushAdapter.sns = snsSender;

        // Mock installations
        var installations = [
            {
                deviceType: 'android',
                deviceToken: 'androidToken'
            }
        ];

        var promise = snsPushAdapter.sendSNSPayload("123", {"test": "hello"});

        var callback = jasmine.createSpy();
        promise.then(function () {
            expect(snsSender.publish).toHaveBeenCalled();
            args = snsSender.publish.calls.first().args;
            expect(args[0].MessageStructure).toEqual("json");
            expect(args[0].TargetArn).toEqual("123");
            expect(args[0].Message).toEqual('{"test":"hello"}');
            done();
        });
    });

    it('can send SNS Payload to Android and iOS', (done) => {
        // Mock out Amazon SNS token exchange
        var snsSender = jasmine.createSpyObj('sns', ['publish', 'createPlatformEndpoint']);

        snsSender.createPlatformEndpoint.and.callFake(function (object, callback) {
            callback(null, {'EndpointArn': 'ARN'});
        });

        snsSender.publish.and.callFake(function (object, callback) {
            callback(null, '123');
        });

        snsPushAdapter.sns = snsSender;

        // Mock installations
        var installations = [
            {
                deviceType: 'android',
                deviceToken: 'androidToken'
            },
            {
                deviceType: 'ios',
                deviceToken: 'iosToken'
            }
        ];

        var promise = snsPushAdapter.send({"test": "hello"}, installations);

        var callback = jasmine.createSpy();
        promise.then(function () {
            expect(snsSender.publish).toHaveBeenCalled();
            expect(snsSender.publish.calls.count()).toEqual(2);
            done();
        });
    });

    function makeDevice(deviceToken, appIdentifier) {
        return {
            deviceToken: deviceToken,
            appIdentifier: appIdentifier
        };
    }

});
