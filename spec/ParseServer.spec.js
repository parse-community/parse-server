"use strict";

// Tests for components within ParseServer
// In this case specifically for testing semantic version comparison
var ParseServer = require("../src/index");

describe('Semantic Version Comparison Testing', () => {
  it('Test Version Simple Equal', done => {
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1','1')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1.0.0','1.0.0')).toEqual(false);
    done();
  });

  it('Test Complex Version Simple Equal', done => {
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.0.1','6.0.1')).toEqual(false);
    done();
  });

  it('Test Version Less Than', done => {
    expect(ParseServer.default.isSemanticVersionLessThanVersion('0','1')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('0.1.0','1.0.0')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('0.0.1','1.0.0')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('0.9.0','0.10.0')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.0.0','6.0.1')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.9.3','6.10.1')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10.4.2','6.10.4.3')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10','6.10.4')).toEqual(true);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10','6.10.4.4')).toEqual(true);
    done();
  });

  it('Test Complex Version Greater Than Equal To', done => {
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1','1')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1.0','1.0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1.0.0','1.0.0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1','0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1.0.0','0.1.0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('1.0.0','0.0.1')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('10.0.0','0.9.0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.0.1','6.0.0')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10.1','6.9.3')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10.4.3','6.10.4.2')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10.4','6.10')).toEqual(false);
    expect(ParseServer.default.isSemanticVersionLessThanVersion('6.10.4.4','6.10')).toEqual(false);
    // just for fun test the current version, which should always be >= 4.6
    expect(ParseServer.default.isSemanticVersionLessThanVersion(process.versions.node,'4.6')).toEqual(false);
    done();
  });

});
