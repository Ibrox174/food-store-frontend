const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function createDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cuisine TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      rating REAL,
      review_count INTEGER NOT NULL DEFAULT 0,
      delivery_min_minutes INTEGER,
      delivery_max_minutes INTEGER,
      delivery_fee_naira INTEGER NOT NULL DEFAULT 0,
      badge TEXT,
      image_url TEXT,
      chowpass_eligible INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS restaurants_active_idx ON restaurants(is_active);
    CREATE INDEX IF NOT EXISTS restaurants_cuisine_idx ON restaurants(cuisine);
  `);

  function listRestaurants({ query = '', cuisine = '', latitude, longitude, radiusKm = 15, filter = 'All' }) {
    const search = query.trim().toLowerCase();
    const cuisineSearch = cuisine.trim().toLowerCase();
    const restaurants = database.prepare('SELECT * FROM restaurants WHERE is_active = 1').all();

    return restaurants
      .map((row) => {
        const distanceKm = haversineDistance(latitude, longitude, row.latitude, row.longitude);
        return {
          id: row.id,
          name: row.name,
          cuisine: row.cuisine,
          description: row.description,
          latitude: row.latitude,
          longitude: row.longitude,
          rating: row.rating,
          reviewCount: row.review_count,
          deliveryMinMinutes: row.delivery_min_minutes,
          deliveryMaxMinutes: row.delivery_max_minutes,
          deliveryFeeNaira: row.delivery_fee_naira,
          badge: row.badge,
          imageUrl: row.image_url,
          chowpassEligible: Boolean(row.chowpass_eligible),
          distanceKm,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      })
      .filter((restaurant) => restaurant.distanceKm <= radiusKm)
      .map((restaurant) => ({ ...restaurant, distanceKm: Number(restaurant.distanceKm.toFixed(2)) }))
      .filter((restaurant) => !search || `${restaurant.name} ${restaurant.cuisine} ${restaurant.description}`.toLowerCase().includes(search))
      .filter((restaurant) => !cuisineSearch || restaurant.cuisine.toLowerCase().includes(cuisineSearch))
      .filter((restaurant) => {
        if (filter === 'Fastest') return restaurant.deliveryMinMinutes !== null && restaurant.deliveryMinMinutes <= 25;
        if (filter === 'Chowpass') return restaurant.chowpassEligible;
        if (filter === 'Rating 4.5+') return restaurant.rating !== null && restaurant.rating >= 4.5;
        return true;
      })
      .sort((first, second) => first.distanceKm - second.distanceKm || first.name.localeCompare(second.name));
  }

  function getRestaurant(id) {
    const row = database.prepare('SELECT * FROM restaurants WHERE id = ? AND is_active = 1').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      cuisine: row.cuisine,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      rating: row.rating,
      reviewCount: row.review_count,
      deliveryMinMinutes: row.delivery_min_minutes,
      deliveryMaxMinutes: row.delivery_max_minutes,
      deliveryFeeNaira: row.delivery_fee_naira,
      badge: row.badge,
      imageUrl: row.image_url,
      chowpassEligible: Boolean(row.chowpass_eligible),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function saveRestaurant(restaurant, id = randomUUID()) {
    const now = new Date().toISOString();
    const existing = getRestaurant(id);

    if (existing) {
      database.prepare(`
        UPDATE restaurants SET
          name = ?, cuisine = ?, description = ?, latitude = ?, longitude = ?, rating = ?,
          review_count = ?, delivery_min_minutes = ?, delivery_max_minutes = ?, delivery_fee_naira = ?,
          badge = ?, image_url = ?, chowpass_eligible = ?, updated_at = ?
        WHERE id = ?
      `).run(
        restaurant.name, restaurant.cuisine, restaurant.description, restaurant.latitude,
        restaurant.longitude, restaurant.rating, restaurant.reviewCount, restaurant.deliveryMinMinutes,
        restaurant.deliveryMaxMinutes ?? null, restaurant.deliveryFeeNaira ?? 0, restaurant.badge ?? null, restaurant.imageUrl ?? null,
        Number(restaurant.chowpassEligible), now, id,
      );
    } else {
      database.prepare(`
        INSERT INTO restaurants (
          id, name, cuisine, description, latitude, longitude, rating, review_count,
          delivery_min_minutes, delivery_max_minutes, delivery_fee_naira, badge, image_url,
          chowpass_eligible, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, restaurant.name, restaurant.cuisine, restaurant.description, restaurant.latitude,
        restaurant.longitude, restaurant.rating, restaurant.reviewCount, restaurant.deliveryMinMinutes,
        restaurant.deliveryMaxMinutes ?? null, restaurant.deliveryFeeNaira ?? 0, restaurant.badge ?? null, restaurant.imageUrl ?? null,
        Number(restaurant.chowpassEligible), now, now,
      );
    }

    return getRestaurant(id);
  }

  function deactivateRestaurant(id) {
    return database.prepare('UPDATE restaurants SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1')
      .run(new Date().toISOString(), id).changes > 0;
  }

  return { listRestaurants, getRestaurant, saveRestaurant, deactivateRestaurant, close: () => database.close() };
}

function haversineDistance(latitude, longitude, targetLatitude, targetLongitude) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(targetLatitude - latitude);
  const longitudeDelta = toRadians(targetLongitude - longitude);
  const startLatitude = toRadians(latitude);
  const endLatitude = toRadians(targetLatitude);
  const distance = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(distance), Math.sqrt(1 - distance));
}

module.exports = { createDatabase };