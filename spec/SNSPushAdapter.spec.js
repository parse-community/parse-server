var SNSPushAdapter = require('../src/Adapters/Push/SNSPushAdapter');
describe('SNSPushAdapter', () => {

    var pushConfig;
    var snsPushAdapter;

    beforeEach(function() {
        pushConfig = {
            pushTypes: {
                ios: {ARN : "APNS_ID", production: false, bundleId: 'com.parseplatform.myapp'},
                android: {ARN: "GCM_ID"}
            },
            accessKey: "accessKey",
            secretKey: "secretKey",
            region: "region"
        };
        snsPushAdapter = new SNSPushAdapter(pushConfig);
    });

    it('can be initialized', (done) => {
        // Make mock config
        var snsPushConfig = snsPushAdapter.snsConfig;

        expect(snsPushConfig).toEqual(pushConfig.pushTypes);

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
        var timeStamp = 1456728000;

        var returnedData = SNSPushAdapter.generateAndroidPayload(data, timeStamp);
        var expectedData = {GCM: '{"priority":"normal","data":{"time":"1970-01-17T20:38:48.000Z"}}'};
        expect(returnedData).toEqual(expectedData)
        done();
    });

    it('can generate the right iOS payload', (done) => {
        var data = {data : {"alert": "Check out these awesome deals!"}};
        var timeStamp = 1456728000;

        var returnedData = SNSPushAdapter.generateiOSPayload(data, true);
        var expectedData = {APNS: '{"aps":{"alert":"Check out these awesome deals!"}}'};

        var returnedData = SNSPushAdapter.generateiOSPayload(data, false);
        var expectedData = {APNS_SANDBOX: '{"aps":{"alert":"Check out these awesome deals!"}}'};

        expect(returnedData).toEqual(expectedData);
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

        var promise = snsPushAdapter.exchangeTokenPromise(makeDevice("androidToken"), "GCM_ID");

        promise.then(function() {
            expect(snsSender.createPlatformEndpoint).toHaveBeenCalled();
            var args = snsSender.createPlatformEndpoint.calls.first().args;
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
            var args = snsSender.publish.calls.first().args;
            expect(args[0].MessageStructure).toEqual("json");
            expect(args[0].TargetArn).toEqual("123");
            expect(args[0].Message).toEqual('{"test":"hello"}');
            done();
        });
    });

    it('errors sending SNS Payload to Android and iOS', (done) => {
        // Mock out Amazon SNS token exchange
        var snsSender = jasmine.createSpyObj('sns', ['publish', 'createPlatformEndpoint']);

        snsSender.createPlatformEndpoint.and.callFake(function (object, callback) {
            callback("error", {});
        });

        snsPushAdapter.getPlatformArn(makeDevice("android"), "android", function(err, data) {
            expect(err).not.toBe(null);
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

        promise.then(function () {
            expect(snsSender.publish).toHaveBeenCalled();
            expect(snsSender.publish.calls.count()).toEqual(2);
            done();
        });
    });

    it('can send to APNS with known identifier', (done) => {
        var snsSender = jasmine.createSpyObj('sns', ['publish', 'createPlatformEndpoint']);

        snsSender.createPlatformEndpoint.and.callFake(function (object, callback) {
            callback(null, {'EndpointArn': 'ARN'});
        });

        snsSender.publish.and.callFake(function (object, callback) {
            callback(null, '123');
        });

        snsPushAdapter.sns = snsSender;

        var promises = snsPushAdapter.sendToAPNS({"test": "hello"}, [makeDevice("ios", "com.parseplatform.myapp")]);
        expect(promises.length).toEqual(1);

        Promise.all(promises).then(function ()  {
            expect(snsSender.publish).toHaveBeenCalled();
            done();
        });

    });

    it('can send to APNS with unknown identifier', (done) => {
        var snsSender = jasmine.createSpyObj('sns', ['publish', 'createPlatformEndpoint']);

        snsSender.createPlatformEndpoint.and.callFake(function (object, callback) {
            callback(null, {'EndpointArn': 'ARN'});
        });

        snsSender.publish.and.callFake(function (object, callback) {
            callback(null, '123');
        });

        snsPushAdapter.sns = snsSender;

        var promises = snsPushAdapter.sendToAPNS({"test": "hello"}, [makeDevice("ios", "com.parseplatform.unknown")]);
        expect(promises.length).toEqual(0);
        done();
    });

    it('can send to APNS with multiple identifiers', (done) => {
        pushConfig = {
            pushTypes: {
                ios: [{ARN : "APNS_SANDBOX_ID", production: false, bundleId: 'beta.parseplatform.myapp'},
                      {ARN : "APNS_PROD_ID", production: true, bundleId: 'com.parseplatform.myapp'}],
                android: {ARN: "GCM_ID"}
            },
            accessKey: "accessKey",
            secretKey: "secretKey",
            region: "region"
        };

        snsPushAdapter = new SNSPushAdapter(pushConfig);

        var snsSender = jasmine.createSpyObj('sns', ['publish', 'createPlatformEndpoint']);

        snsSender.createPlatformEndpoint.and.callFake(function (object, callback) {
            callback(null, {'EndpointArn': 'APNS_PROD_ID'});
        });

        snsSender.publish.and.callFake(function (object, callback) {
            callback(null, '123');
        });

        snsPushAdapter.sns = snsSender;

        var promises = snsPushAdapter.sendToAPNS({"test": "hello"}, [makeDevice("ios", "beta.parseplatform.myapp")]);
        expect(promises.length).toEqual(1);
        Promise.all(promises).then(function () {
            expect(snsSender.publish).toHaveBeenCalled();
            var args = snsSender.publish.calls.first().args[0];
            expect(args.Message).toEqual("{\"APNS_SANDBOX\":\"{}\"}");
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
