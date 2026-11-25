// Polygon object lifecycle over REST (save / get / update / equalTo / validation).
// Ported from spec/ParsePolygon.spec.js.
import { createObject, getObject, updateObject, find } from '../../helpers/client.ts';
import { polygon } from '../../helpers/geo.ts';
import { expectParseError } from '../../helpers/request.ts';

const OPEN = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
];
const CLOSED = [...OPEN, [0, 0]];

describe('Polygon REST', () => {
  it('saves an open path and reads it back closed', async () => {
    const created = await createObject('TestObject', { polygon: polygon(OPEN) });
    const result = await getObject('TestObject', created.objectId);
    expect(result.polygon.__type).toEqual('Polygon');
    expect(result.polygon.coordinates).toEqual(CLOSED);
  });

  it('saves an already-closed path unchanged', async () => {
    const created = await createObject('TestObject', { polygon: polygon(CLOSED) });
    const result = await getObject('TestObject', created.objectId);
    expect(result.polygon.__type).toEqual('Polygon');
    expect(result.polygon.coordinates).toEqual(CLOSED);
  });

  it_id('3019353b-d5b3-4e53-bcb1-716418328bdd')(it)(
    'matches equalTo with either the open or closed path',
    async () => {
      await createObject('TestObject', { polygon: polygon(OPEN) });

      const openMatches = await find('TestObject', { where: { polygon: polygon(OPEN) } });
      expect(openMatches.length).toEqual(1);
      expect(openMatches[0].polygon.coordinates).toEqual(CLOSED);

      const closedMatches = await find('TestObject', { where: { polygon: polygon(CLOSED) } });
      expect(closedMatches.length).toEqual(1);
      expect(closedMatches[0].polygon.coordinates).toEqual(CLOSED);
    }
  );

  it('updates a polygon', async () => {
    const created = await createObject('TestObject', { polygon: polygon(OPEN) });
    const newCoords = [
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 2],
    ];
    await updateObject('TestObject', created.objectId, { polygon: polygon(newCoords) });
    const result = await getObject('TestObject', created.objectId);
    expect(result.polygon.coordinates).toEqual([...newCoords, [2, 2]]);
  });

  it('saves a counterclockwise path', async () => {
    const coords = [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ];
    const created = await createObject('TestObject', { polygon: polygon(coords) });
    const result = await getObject('TestObject', created.objectId);
    expect(result.polygon.coordinates).toEqual([...coords, [1, 1]]);
  });

  it('rejects non-numeric coordinates', async () => {
    const coords = [
      ['foo', 'bar'],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    await expectParseError(createObject('TestObject', { polygon: polygon(coords) }));
  });

  it('rejects fewer than three points', async () => {
    await expectParseError(createObject('TestObject', { polygon: polygon([[0, 0]]) }));
  });

  it('rejects fewer than three distinct points', async () => {
    const coords = [
      [0, 0],
      [0, 1],
      [0, 0],
    ];
    await expectParseError(createObject('TestObject', { polygon: polygon(coords) }));
  });
});
