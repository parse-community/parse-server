import { libraries } from "@detail-dev/replay";

const pg = jest.createMockFromModule('pg');

// Mock the necessary methods and properties of the pg module
// For example:
const mockPg = libraries.PgInterceptor.createMock();
Object.entries(mockPg).forEach(([k,v]) => {
  // @ts-ignore
  pg[k] = v;
})

module.exports = pg;
