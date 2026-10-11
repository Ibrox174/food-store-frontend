const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createApp } = require('../index');
const { createDatabase } = require('../database');

let server;
let baseUrl;
let store;

before(async () => {
  store = createDatabase(':memory:');
  const app = createApp({ database: store, adminApiKey: 'test-admin-key' });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  store?.close();
});

test('catalog starts empty and requires valid coordinates', async () => {
  const response = await fetch(`${baseUrl}/api/restaurants`);
  assert.equal(response.status, 400);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });
});

test('restaurant writes require admin credentials and nearby results are filtered', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/restaurants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(restaurant('Nearby Kitchen', 0.005, 0.005)),
  });
  assert.equal(unauthorized.status, 401);

  const headers = { 'content-type': 'application/json', 'x-admin-key': 'test-admin-key' };
  const nearby = await fetch(`${baseUrl}/api/restaurants`, {
    method: 'POST', headers,
    body: JSON.stringify(restaurant('Nearby Kitchen', 0.005, 0.005)),
  });
  const nearbyBody = await nearby.json();
  assert.equal(nearby.status, 201);

  const distant = await fetch(`${baseUrl}/api/restaurants`, {
    method: 'POST', headers,
    body: JSON.stringify(restaurant('Distant Kitchen', 1, 1)),
  });
  assert.equal(distant.status, 201);

  const results = await fetch(`${baseUrl}/api/restaurants?lat=0&lon=0&radiusKm=2`);
  const body = await results.json();
  assert.equal(body.count, 1);
  assert.equal(body.restaurants[0].name, 'Nearby Kitchen');
  assert.ok(body.restaurants[0].distanceKm > 0);

  const updated = await fetch(`${baseUrl}/api/restaurants/${nearbyBody.restaurant.id}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ ...nearbyBody.restaurant, name: 'Updated Kitchen' }),
  });
  assert.equal((await updated.json()).restaurant.name, 'Updated Kitchen');

  const deleted = await fetch(`${baseUrl}/api/restaurants/${nearbyBody.restaurant.id}`, {
    method: 'DELETE', headers,
  });
  assert.equal(deleted.status, 204);
});

test('reverse geocoding validates coordinates before making an external request', async () => {
  const response = await fetch(`${baseUrl}/api/location/reverse?lat=999&lon=0`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Valid latitude and longitude/);
});

test('restaurant records persist after reopening the database', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'store-api-'));
  const databasePath = path.join(directory, 'store.sqlite');
  const firstDatabase = createDatabase(databasePath);
  const created = firstDatabase.saveRestaurant(restaurant('Persistent Kitchen', 6.45, 3.4));
  firstDatabase.close();

  const reopenedDatabase = createDatabase(databasePath);
  assert.equal(reopenedDatabase.getRestaurant(created.id).name, 'Persistent Kitchen');
  reopenedDatabase.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function restaurant(name, latitude, longitude) {
  return {
    name,
    cuisine: 'Nigerian',
    description: 'Fresh meals prepared by this kitchen.',
    latitude,
    longitude,
    rating: 4.7,
    reviewCount: 24,
    deliveryMinMinutes: 20,
    deliveryMaxMinutes: 30,
    deliveryFeeNaira: 500,
    chowpassEligible: true,
  };
}