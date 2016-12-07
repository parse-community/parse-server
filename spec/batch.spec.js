var batch = require('../src/batch');

const originalURL = '/parse/batch';
const serverURL = 'http://localhost:1234/parse';
const serverURL1 = 'http://localhost:1234/1';
const serverURLNaked = 'http://localhost:1234/';
const publicServerURL = 'http://domain.com/parse';
const publicServerURLNaked = 'http://domain.com/';

describe('batch', () => {
  it('should return the proper url', () => {
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL)('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url same public/local endpoint', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL, serverURL, publicServerURL)('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with different public/local mount', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL, serverURL1, publicServerURL)('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with naked public', () => {
    const originalURL = '/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL, serverURL, publicServerURLNaked)('/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });

  it('should return the proper url with naked local', () => {
    const originalURL = '/parse/batch';
    const internalURL = batch.makeBatchRoutingPathFunction(originalURL, serverURLNaked, publicServerURL)('/parse/classes/Object');

    expect(internalURL).toEqual('/classes/Object');
  });
});
