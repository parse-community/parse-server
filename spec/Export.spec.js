const Parse = require("parse/node");
const request = require('request');
const AdmZip = require('adm-zip');

describe('Export router', () => {

  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': 'test',
    'X-Parse-Master-Key': 'test'
  };

  const createRecords = (itemCount) => {
    const ExportTest = Parse.Object.extend("ExportTest");

    const items = new Array(itemCount).fill().map((item, index) => {

      const exportTest = new ExportTest();

      exportTest.set('field1', `value1-${index}`);
      exportTest.set('field2', `value2-${index}`);

      return exportTest;
    });


    return Parse.Object.saveAll(items);
  };

  it_exclude_dbs(['postgres'])('should create export progress', (done) => {

    reconfigureServer({
      emailAdapter : {
        sendMail : () => {
          done();
        }
      }
    })
    .then(() => {
      return createRecords(50);
    })
    .then(() => {
      request.put(
        {
          headers: headers,
          url: 'http://localhost:8378/1/export_data',
          body: JSON.stringify({
            name: 'ExportTest',
            feedbackEmail: 'my@email.com'
          })
        },
        () => {

          request.get(
            {
              headers: headers,
              url: 'http://localhost:8378/1/export_progress'
            },
            (err, response, body) => {

              const progress = JSON.parse(body);

              expect(progress instanceof Array).toBe(true);
              expect(progress.length).toBe(1);

              if (progress.length) {
                expect(progress[0].id).toBe('ExportTest');
              }

            });
        }
      );
    }
    );
  });

  it_exclude_dbs(['postgres'])('send success export mail', (done) => {

    let results = [];

    const emailAdapter = {
      sendMail: ({ link, to, subject}) => {

        expect(to).toEqual('my@email.com');
        expect(subject).toEqual('Export completed');

        request.get({ url: link, encoding: null }, function(err, res, zipFile) {

          if(err) throw err;

          const zip = new AdmZip(zipFile);
          const zipEntries = zip.getEntries();

          expect(zipEntries.length).toEqual(1);

          const entry = zipEntries.pop();
          const text = entry.getData().toString('utf8');
          const resultsToCompare = JSON.parse(text);

          expect(results.results.length).toEqual(resultsToCompare.results.length);

          done();
        });
      }
    }
    reconfigureServer({
      emailAdapter: emailAdapter
    })
    .then(() => {
      return createRecords(50);
    })
    .then(() => {
      request.get(
        {
          headers: headers,
          url: 'http://localhost:8378/1/classes/ExportTest',
        },
        (err, response, body) => {
          results = JSON.parse(body);

          request.put(
            {
              headers: headers,
              url: 'http://localhost:8378/1/export_data',
              body: JSON.stringify({
                name: 'ExportTest',
                feedbackEmail: 'my@email.com'
              })
            },
            (err, response, body) => {
              expect(err).toBe(null);
              expect(body).toEqual('"We are exporting your data. You will be notified by e-mail once it is completed."');
            }
          );
        }
      );
    });
  });

  it_exclude_dbs(['postgres'])('send success export mail with where parameter', (done) => {
    const emailAdapter = {
      sendMail: ({ link, to, subject}) => {

        expect(to).toEqual('my@email.com');
        expect(subject).toEqual('Export completed');

        request.get({ url: link, encoding: null }, function(err, res, zipFile) {

          if(err) throw err;

          const zip = new AdmZip(zipFile);
          const zipEntries = zip.getEntries();

          expect(zipEntries.length).toEqual(1);

          const entry = zipEntries.pop();
          const text = entry.getData().toString('utf8');
          const resultsToCompare = JSON.parse(text);

          expect(resultsToCompare.results.length).toEqual(1);

          done();
        });
      }
    }
    reconfigureServer({
      emailAdapter: emailAdapter
    })
      .then(() => {
        return createRecords(1000);
      })
      .then(() => {
        request.put(
          {
            headers: headers,
            url: 'http://localhost:8378/1/export_data',
            body: JSON.stringify({
              name: 'ExportTest',
              where: {'field1': 'value1-500'},
              feedbackEmail: 'my@email.com'
            })
          },
          (err, response, body) => {
            expect(err).toBe(null);
            expect(body).toEqual('"We are exporting your data. You will be notified by e-mail once it is completed."');
          }
        );
      });
  });
});
