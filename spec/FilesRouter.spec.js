const fs = require('fs');
const path = require('path');

describe('FilesRouter', () => {
  describe('File Uploads', () => {

    beforeEach(async () => {
      // Set the maxUploadSize to 1GB
      await reconfigureServer({
        maxUploadSize: '1GB',
      });
    });

    const V8_STRING_LIMIT_BYTES = 536_870_912;

    /**
     * Quick helper function to upload the file to the server via the REST API
     * We do this because creating a Parse.File object with a file over 512MB
     * will try to use the Web FileReader API, which will fail the test
     *
     * @param {string} fileName the name of the file
     * @param {string} filePath the path to the file locally
     * @returns
     */
    const postFile = async (fileName, filePath) => {
      const url = `${Parse.serverURL}/files/${fileName}`;
      const headers = {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': Parse.masterKey,
        'Content-Type': 'multipart/form-data',
      };

      const fileStream = fs.createReadStream(filePath);

      // Send the request
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: fileStream,
        duplex: 'half' // This is required to send a stream
      });

      return response;
    };

    it('should allow Parse.File uploads under 512MB', async done => {
      const filePath = path.join(__dirname, 'file.txt');
      await fs.promises.writeFile(filePath, Buffer.alloc(1024 * 1024));

      const response = await postFile('file.txt', filePath);
      expect(response.ok).toBe(true);

      fs.unlinkSync(filePath);
      done();
    });

    it('should allow Parse.File uploads exactly 512MB', async done => {
      const filePath = path.join(__dirname, 'file.txt');
      await fs.promises.writeFile(filePath, Buffer.alloc(V8_STRING_LIMIT_BYTES));

      const response = await postFile('file.txt', filePath);
      expect(response.ok).toBe(true);

      fs.unlinkSync(filePath);
      done();
    });

    it('should allow Parse.File uploads over 512MB', async done => {
      const filePath = path.join(__dirname, 'file.txt');
      await fs.promises.writeFile(filePath, Buffer.alloc(V8_STRING_LIMIT_BYTES + 50 * 1024 * 1024));

      const response = await postFile('file.txt', filePath);
      expect(response.ok).toBe(true);

      fs.unlinkSync(filePath);
      done();
    });
  });
});
