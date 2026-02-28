'use strict';

const request = require('../lib/request');

describe('Parse Decimal128', () => {
  it('should save and retrieve a Decimal128 value via REST API', async () => {
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestDecimal',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: {
          __type: 'Decimal128',
          value: '12345678901234567890.123456789',
        },
      },
    });
    expect(createResponse.data.objectId).toBeDefined();

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/TestDecimal/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount).toEqual({
      __type: 'Decimal128',
      value: '12345678901234567890.123456789',
    });
  });

  it('should update a Decimal128 value', async () => {
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestDecimal',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: {
          __type: 'Decimal128',
          value: '100.50',
        },
      },
    });

    await request({
      method: 'PUT',
      url: `http://localhost:8378/1/classes/TestDecimal/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: {
          __type: 'Decimal128',
          value: '200.75',
        },
      },
    });

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/TestDecimal/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount).toEqual({
      __type: 'Decimal128',
      value: '200.75',
    });
  });

  it('should query with $gt comparison on Decimal128', async () => {
    const values = ['10.5', '20.5', '30.5'];
    for (const val of values) {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/DecimalQuery',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
          'Content-Type': 'application/json',
        },
        body: {
          amount: { __type: 'Decimal128', value: val },
        },
      });
    }

    const queryResponse = await request({
      url: 'http://localhost:8378/1/classes/DecimalQuery',
      qs: {
        where: JSON.stringify({
          amount: { $gt: { __type: 'Decimal128', value: '15.0' } },
        }),
      },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(queryResponse.data.results.length).toBe(2);
    const resultValues = queryResponse.data.results.map(r => r.amount.value).sort();
    expect(resultValues).toEqual(['20.5', '30.5']);
  });

  it('should query with $lt comparison on Decimal128', async () => {
    const values = ['100', '200', '300'];
    for (const val of values) {
      await request({
        method: 'POST',
        url: 'http://localhost:8378/1/classes/DecimalLt',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
          'Content-Type': 'application/json',
        },
        body: {
          amount: { __type: 'Decimal128', value: val },
        },
      });
    }

    const queryResponse = await request({
      url: 'http://localhost:8378/1/classes/DecimalLt',
      qs: {
        where: JSON.stringify({
          amount: { $lt: { __type: 'Decimal128', value: '250' } },
        }),
      },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(queryResponse.data.results.length).toBe(2);
    const resultValues = queryResponse.data.results.map(r => r.amount.value).sort();
    expect(resultValues).toEqual(['100', '200']);
  });

  it('should handle high-precision Decimal128 values', async () => {
    const highPrecisionValue = '9999999999999999999999999999999999';
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalPrecision',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: highPrecisionValue },
      },
    });

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/DecimalPrecision/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount.__type).toBe('Decimal128');
    expect(getResponse.data.amount.value).toBeDefined();
  });

  it('should handle negative Decimal128 values', async () => {
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalNeg',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: '-12345.6789' },
      },
    });

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/DecimalNeg/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount).toEqual({
      __type: 'Decimal128',
      value: '-12345.6789',
    });
  });

  it('should handle zero Decimal128 value', async () => {
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalZero',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: '0' },
      },
    });

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/DecimalZero/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount).toEqual({
      __type: 'Decimal128',
      value: '0',
    });
  });

  it('should set Decimal128 field via schema API', async () => {
    await request({
      method: 'POST',
      url: 'http://localhost:8378/1/schemas/DecimalSchema',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        className: 'DecimalSchema',
        fields: {
          amount: { type: 'Decimal128' },
        },
      },
    });

    const schemaResponse = await request({
      url: 'http://localhost:8378/1/schemas/DecimalSchema',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(schemaResponse.data.fields.amount.type).toBe('Decimal128');
  });

  it('should delete Decimal128 field value', async () => {
    const createResponse = await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalDel',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: '42.0' },
      },
    });

    await request({
      method: 'PUT',
      url: `http://localhost:8378/1/classes/DecimalDel/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __op: 'Delete' },
      },
    });

    const getResponse = await request({
      url: `http://localhost:8378/1/classes/DecimalDel/${createResponse.data.objectId}`,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(getResponse.data.amount).toBeUndefined();
  });

  it('should query with equality on Decimal128', async () => {
    await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalEq',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: '99.99' },
        label: 'target',
      },
    });
    await request({
      method: 'POST',
      url: 'http://localhost:8378/1/classes/DecimalEq',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
        'Content-Type': 'application/json',
      },
      body: {
        amount: { __type: 'Decimal128', value: '50.00' },
        label: 'other',
      },
    });

    const queryResponse = await request({
      url: 'http://localhost:8378/1/classes/DecimalEq',
      qs: {
        where: JSON.stringify({
          amount: { __type: 'Decimal128', value: '99.99' },
        }),
      },
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    });
    expect(queryResponse.data.results.length).toBe(1);
    expect(queryResponse.data.results[0].label).toBe('target');
  });
});
