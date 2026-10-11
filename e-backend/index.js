const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { createDatabase } = require('./database');
const geocodeRequests = new Map();
let lastGeocodeRequest = 0;

function createApp({ database, adminApiKey = process.env.ADMIN_API_KEY } = {}) {
  const store = database || createDatabase(process.env.DATABASE_PATH || path.join(__dirname, 'data', 'store.sqlite'));
  const app = express();

  app.locals.store = store;
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/restaurants', (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    const radiusKm = req.query.radiusKm === undefined ? 15 : Number(req.query.radiusKm);
    const filter = req.query.filter || 'All';

    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return res.status(400).json({ message: 'Valid lat and lon query parameters are required.' });
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
      return res.status(400).json({ message: 'radiusKm must be between 1 and 100.' });
    }
    if (!['All', 'Fastest', 'Chowpass', 'Rating 4.5+'].includes(filter)) {
      return res.status(400).json({ message: 'Unsupported restaurant filter.' });
    }

    const restaurants = store.listRestaurants({
      latitude,
      longitude,
      radiusKm,
      query: typeof req.query.q === 'string' ? req.query.q : '',
      cuisine: typeof req.query.cuisine === 'string' ? req.query.cuisine : '',
      filter,
    });
    res.json({ restaurants, count: restaurants.length, radiusKm });
  });

  app.get('/api/restaurants/:id', (req, res) => {
    const restaurant = store.getRestaurant(req.params.id);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found.' });
    res.json({ restaurant });
  });

  app.post('/api/restaurants', requireAdmin(adminApiKey), (req, res) => {
    const validation = validateRestaurant(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const restaurant = store.saveRestaurant(validation.value);
    res.status(201).json({ restaurant });
  });

  app.put('/api/restaurants/:id', requireAdmin(adminApiKey), (req, res) => {
    const current = store.getRestaurant(req.params.id);
    if (!current) return res.status(404).json({ message: 'Restaurant not found.' });
    const validation = validateRestaurant({ ...current, ...req.body });
    if (validation.error) return res.status(400).json({ message: validation.error });
    const restaurant = store.saveRestaurant(validation.value, req.params.id);
    res.json({ restaurant });
  });

  app.delete('/api/restaurants/:id', requireAdmin(adminApiKey), (req, res) => {
    if (!store.deactivateRestaurant(req.params.id)) {
      return res.status(404).json({ message: 'Restaurant not found.' });
    }
    res.status(204).end();
  });

  app.get('/api/location/reverse', async (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
    }

    const client = req.ip;
    const now = Date.now();
    const lastRequest = geocodeRequests.get(client) || 0;
    if (now - lastRequest < 1100 || now - lastGeocodeRequest < 1100) {
      return res.status(429).json({ message: 'Please wait before requesting another address lookup.' });
    }
    geocodeRequests.set(client, now);
    lastGeocodeRequest = now;

    try {
      const query = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        zoom: '16',
        addressdetails: '1',
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
        headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'ChowdeckStore/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) throw new Error('Reverse geocoding request failed');

      const data = await response.json();
      res.json({ displayName: data.display_name, address: data.address });
    } catch {
      res.status(502).json({ message: 'Could not look up this location.' });
    }
  });

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ message: 'Request body must contain valid JSON.' });
    }
    console.error(error);
    res.status(500).json({ message: 'An unexpected server error occurred.' });
  });

  return app;
}

function requireAdmin(adminApiKey) {
  return (req, res, next) => {
    if (!adminApiKey) return res.status(503).json({ message: 'Restaurant management is not configured.' });
    if (req.get('x-admin-key') !== adminApiKey) return res.status(401).json({ message: 'Valid admin credentials are required.' });
    next();
  };
}

function validateRestaurant(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'A restaurant object is required.' };
  }

  const name = stringField(input.name, 120);
  const cuisine = stringField(input.cuisine, 80);
  const description = typeof (input.description ?? '') === 'string' ? (input.description ?? '').trim() : null;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const rating = input.rating === null || input.rating === undefined || input.rating === '' ? null : Number(input.rating);
  const reviewCount = input.reviewCount === undefined ? 0 : Number(input.reviewCount);
  const deliveryMinMinutes = optionalInteger(input.deliveryMinMinutes);
  const deliveryMaxMinutes = optionalInteger(input.deliveryMaxMinutes);
  const deliveryFeeNaira = input.deliveryFeeNaira === undefined ? 0 : Number(input.deliveryFeeNaira);
  const badge = input.badge == null || input.badge === '' ? null : stringField(input.badge, 100);
  const imageUrl = input.imageUrl == null || input.imageUrl === '' ? null : validImageUrl(input.imageUrl);
  const chowpassEligible = input.chowpassEligible === undefined ? false : input.chowpassEligible;

  if (!name || !cuisine || description === null || description.length > 500) return { error: 'Name, cuisine, and valid description are required.' };
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'Valid restaurant latitude and longitude are required.' };
  }
  if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) return { error: 'rating must be between 0 and 5.' };
  if (!Number.isInteger(reviewCount) || reviewCount < 0) return { error: 'reviewCount must be a non-negative integer.' };
  if (deliveryMinMinutes === false || deliveryMaxMinutes === false ||
      (deliveryMinMinutes !== null && deliveryMaxMinutes !== null && deliveryMinMinutes > deliveryMaxMinutes)) {
    return { error: 'Delivery time must use valid minutes with min less than or equal to max.' };
  }
  if (!Number.isInteger(deliveryFeeNaira) || deliveryFeeNaira < 0) return { error: 'deliveryFeeNaira must be a non-negative integer.' };
  if (badge === false || imageUrl === false) return { error: 'badge or imageUrl is invalid.' };
  if (typeof chowpassEligible !== 'boolean') return { error: 'chowpassEligible must be a boolean.' };

  return {
    value: {
      name, cuisine, description, latitude, longitude, rating, reviewCount,
      deliveryMinMinutes, deliveryMaxMinutes, deliveryFeeNaira, badge, imageUrl, chowpassEligible,
    },
  };
}

function stringField(value, maximumLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : false;
}

function validImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:' ? value : false;
  } catch {
    return false;
  }
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
}

module.exports = { createApp, validateRestaurant };