/**
 * A mock mail adapter for testing.
 */
class MockMailAdapter {
  constructor(options = {}) {
    if (options.throw) {
      throw 'MockMailAdapterConstructor';
    }
  }
  sendMail() {
    return 'MockMailAdapterSendMail';
  }
}

module.exports = MockMailAdapter;
