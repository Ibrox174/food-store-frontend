# Store API

The API stores merchant restaurant listings in SQLite. It starts with an empty catalog by design; add verified merchant data before expecting nearby results. Requires Node.js 22.13 or newer for `node:sqlite`.

## Run locally

```powershell
npm install
$env:ADMIN_API_KEY = "replace-with-a-long-random-secret"
$env:NOMINATIM_USER_AGENT = "YourStore/1.0 (operations@example.com)"
npm run dev
```

The database defaults to `e-backend/data/store.sqlite`. Set `DATABASE_PATH` to use another persistent disk location. `PORT` defaults to `5000`; set `FRONTEND_ORIGIN` to the deployed frontend origin when hosting the API separately. The default allowed frontend origin is `https://food-store-frontend-six.vercel.app`.

In the frontend, set `VITE_API_BASE_URL` to the API origin for a separate deployment. During local Vite development, `/api` is proxied to `http://localhost:5000`.

## Endpoints

- `GET /api/health`
- `GET /api/restaurants?lat=...&lon=...&radiusKm=15&q=...&cuisine=...&filter=All`
- `GET /api/restaurants/:id`
- `POST /api/restaurants` (admin)
- `PUT /api/restaurants/:id` (admin)
- `DELETE /api/restaurants/:id` (admin; soft delete)
- `GET /api/location/reverse?lat=...&lon=...`

Restaurant writes require the `x-admin-key` header to match `ADMIN_API_KEY`. A restaurant record requires `name`, `cuisine`, `latitude`, and `longitude`; optional fields include `description`, `rating`, `reviewCount`, `deliveryMinMinutes`, `deliveryMaxMinutes`, `deliveryFeeNaira`, `badge`, `imageUrl` (HTTPS only), and `chowpassEligible`.

Example merchant create request:

```powershell
$headers = @{ "x-admin-key" = $env:ADMIN_API_KEY }
$body = @{
  name = "Merchant-provided restaurant name"
  cuisine = "Nigerian"
  description = "Merchant-provided menu summary"
  latitude = 6.45
  longitude = 3.40
  deliveryFeeNaira = 500
  chowpassEligible = $false
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/restaurants" -Headers $headers -ContentType "application/json" -Body $body
```

Do not commit the admin key or SQLite database. For production, use a managed database and a dedicated merchant identity/authorization service rather than sharing one admin key. Reverse geocoding uses the public OpenStreetMap Nominatim service and is rate-limited to one lookup per second across this API process; configure an identifying `NOMINATIM_USER_AGENT` with a real operations contact and comply with its usage policy. For larger production traffic, use a contracted geocoding provider.

## Tests

```powershell
npm test
```
