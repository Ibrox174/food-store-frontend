import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const cuisineImages = [
  { name: 'Jollof & Grills', image: 'photo-1604908176997-125f25cc6f3d' },
  { name: 'Suya & Asun', image: 'photo-1544025162-d76694265947' },
  { name: 'Pepper Soup', image: 'photo-1547592180-85f173990554' },
  { name: 'Swallow & Native', image: 'photo-1604329760661-e71dc83f8f26' },
  { name: 'Korede Pasta', image: 'photo-1473093295043-cdd812d0e601' },
  { name: 'Shawarma & Fast', image: 'photo-1529006557810-274b9b2fc783' },
  { name: 'Akara & Breakfast', image: 'photo-1525351484163-7529414344d8' },
  { name: 'Parfait & Drinks', image: 'photo-1490645935967-10de6ba17061' },
]

const cuisineFilters = [
  'All Cuisines',
  'Jollof & Grills',
  'Swallow & Native Soups',
  'Shawarma & Fast Food',
  'Korede Spaghetti & Pasta',
  'Groceries & Supermarket',
  'Breakfast & Bakes',
  'Drinks',
]

function foodPhoto(id, width = 800) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
}

function formatNaira(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount)
}

function App() {
  const [backendMessage, setBackendMessage] = useState('Checking connection')
  const [location, setLocation] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [locationStatus, setLocationStatus] = useState('')
  const [activeCuisine, setActiveCuisine] = useState('All Cuisines')
  const [restaurantFilter, setRestaurantFilter] = useState('All')
  const [restaurants, setRestaurants] = useState([])
  const [restaurantStatus, setRestaurantStatus] = useState('Set your location to find nearby restaurants.')
  const [restaurantLoading, setRestaurantLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let isMounted = true

    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error('Backend request failed')
        return response.json()
      })
      .then((data) => {
        if (isMounted) setBackendMessage(data.status === 'ok' ? 'Store service online' : 'Store service offline')
      })
      .catch(() => {
        if (isMounted) setBackendMessage('Store service offline')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!coordinates) return undefined

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRestaurantLoading(true)
      setRestaurantStatus('Finding restaurants near you...')

      try {
        const params = new URLSearchParams({
          lat: String(coordinates.latitude),
          lon: String(coordinates.longitude),
          radiusKm: '15',
          filter: restaurantFilter,
          q: search.trim(),
        })
        const cuisine = activeCuisine === 'All Cuisines'
          ? ''
          : activeCuisine === 'Swallow & Native Soups'
            ? 'Swallow & Native'
            : activeCuisine === 'Korede Spaghetti & Pasta'
              ? 'Korede Pasta'
              : activeCuisine
        if (cuisine) params.set('cuisine', cuisine)

        const response = await fetch(`${API_BASE_URL}/api/restaurants?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not load nearby restaurants.')
        setRestaurants(data.restaurants)
        setRestaurantStatus(data.count
          ? `${data.count} restaurant${data.count === 1 ? '' : 's'} within ${data.radiusKm} km.`
          : `No restaurants are currently listed within ${data.radiusKm} km.`)
      } catch (error) {
        if (error.name !== 'AbortError') {
          setRestaurants([])
          setRestaurantStatus(error.message || 'Could not load nearby restaurants.')
        }
      } finally {
        if (!controller.signal.aborted) setRestaurantLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [activeCuisine, coordinates, restaurantFilter, search])

  function detectLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported by this browser.')
      return
    }

    setLocationStatus('Getting your location...')
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const currentCoordinates = { latitude: coords.latitude, longitude: coords.longitude }
      setCoordinates(currentCoordinates)
      setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`)

      try {
        const params = new URLSearchParams({ lat: coords.latitude, lon: coords.longitude })
        const response = await fetch(`${API_BASE_URL}/api/location/reverse?${params}`)
        if (!response.ok) throw new Error('Location lookup failed')
        const data = await response.json()
        const address = data.address || {}
        const nearbyArea = address.suburb || address.neighbourhood || address.city_district ||
          address.city || address.town || address.village || address.state
        setLocation(nearbyArea || data.displayName || 'Current location')
        setLocationStatus('Location updated from your device.')
      } catch {
        setLocationStatus('Coordinates found, but the address lookup failed.')
      }
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Enable it in your browser to continue.'
        : 'Could not get your location. Check your device settings and try again.')
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
  }

  return (
    <div className="chowdeck-page" id="top">
      <header className="top-shell">
        <div className="utility-nav">
          <a className="brand" href="#top"><span className="brand-mark">⌁</span> Chowdeck</a>
          <div className="location-picker">
            <span aria-hidden="true">⌖</span>
            <button type="button" onClick={detectLocation} aria-label="Use my current location">
              {location || 'Use my location'}
            </button>
          </div>
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jollof, suya, restaurants, or groceries..." aria-label="Search food and restaurants" />
          </label>
        </div>
        <nav className="cuisine-nav" aria-label="Cuisine categories">
          {cuisineFilters.map((cuisine) => (
            <button key={cuisine} className={activeCuisine === cuisine ? 'active' : ''} onClick={() => { setActiveCuisine(cuisine); document.getElementById('restaurants')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} type="button">{cuisine}</button>
          ))}
        </nav>
      </header>

      <main>
        <section className="welcome-band">
          <div className="welcome-copy">
            <p className="micro-label coral-label">⚡ FAST DELIVERY, WHERE AVAILABLE</p>
            <h1>See it to jëun?<br /><span>You don chow?</span></h1>
            <p className="welcome-subtitle">Fresh jollof, steamy amala, spicy grills, and cold sips delivered to your door.</p>
            <div className="promise-pills">
              <span className="promise-primary">✦ Sorted by distance</span>
              <span>Search verified listings</span>
            </div>
          </div>
          <aside className="coupon-card" aria-label="Nearby restaurant search">
            <div className="coupon-topline"><span className="coupon-tag">NEARBY SEARCH</span><span>15 km radius</span></div>
            <h2>Find restaurants <strong>near you</strong></h2>
            <p>Listings are sorted by distance from your current device location.</p>
            <div className="coupon-code"><span><small>⌖ &nbsp;Delivery area</small><b>{location || 'Not set'}</b></span><button type="button" onClick={detectLocation}>{location ? 'Update location' : 'Use my location'}</button></div>
            <p className="coupon-terms" aria-live="polite">{locationStatus || 'Set your location to find nearby restaurants.'}</p>
          </aside>
        </section>

        <section className="cuisine-section" aria-labelledby="cuisine-title">
          <div className="section-kicker">WHEN YOU’RE CRAVING</div>
          <div className="cuisine-heading"><h2 id="cuisine-title">Explore Nigerian Cuisines & Street Flavors</h2><div className="rail-controls"><button type="button" aria-label="Previous cuisines">‹</button><button type="button" aria-label="Next cuisines">›</button></div></div>
          <div className="cuisine-rail">
            {cuisineImages.map((cuisine) => (
              <button className="cuisine-item" type="button" key={cuisine.name} onClick={() => setActiveCuisine(cuisine.name)} aria-pressed={activeCuisine === cuisine.name}>
                <img src={foodPhoto(cuisine.image, 240)} alt="" loading="lazy" />
                <span>{cuisine.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="restaurant-section" id="restaurants" aria-labelledby="restaurant-title">
          <div className="section-kicker">NEARBY BUSINESSES</div>
          <div className="restaurant-heading"><h2 id="restaurant-title">Restaurants near you</h2><div className="restaurant-filters" role="group" aria-label="Filter restaurants">{['All', 'Fastest', 'Chowpass', 'Rating 4.5+'].map((filter) => <button className={restaurantFilter === filter ? 'active' : ''} key={filter} type="button" aria-pressed={restaurantFilter === filter} onClick={() => setRestaurantFilter(filter)}>{filter}</button>)}</div></div>
          {restaurants.length ? <div className="restaurant-grid">
            {restaurants.map((restaurant, index) => (
              <article className="restaurant-card" key={restaurant.id} style={{ '--card-index': index }}>
                <div className="restaurant-photo">{restaurant.imageUrl ? <img src={restaurant.imageUrl} alt={`${restaurant.name}`} loading="lazy" /> : <div className="restaurant-photo-empty">Image not provided</div>}{restaurant.badge && <span className="restaurant-badge">{restaurant.badge}</span>}<div className="delivery-strip">◷ {restaurant.deliveryMinMinutes && restaurant.deliveryMaxMinutes ? `${restaurant.deliveryMinMinutes}–${restaurant.deliveryMaxMinutes} min` : 'Delivery time not listed'} · {formatNaira(restaurant.deliveryFeeNaira)} delivery · {restaurant.distanceKm} km</div></div>
                <div className="restaurant-info"><div className="restaurant-name-line"><h3>{restaurant.name}</h3><span className="rating">{restaurant.rating === null ? 'New' : `★ ${restaurant.rating.toFixed(1)}`} <small>({restaurant.reviewCount} reviews)</small></span></div><p>{restaurant.description}</p><div className="restaurant-bottom"><span className="food-tag">{restaurant.cuisine}</span></div></div>
              </article>
            ))}
          </div> : <p className="no-restaurants" aria-live="polite">{restaurantLoading ? 'Finding restaurants near you...' : restaurantStatus}</p>}
        </section>

        <section className="coverage-section" aria-labelledby="coverage-title">
          <div className="section-kicker coral-text">YOUR DELIVERY LOCATION</div>
          <div className="coverage-heading"><div><h2 id="coverage-title">Delivery area</h2><p aria-live="polite">{locationStatus || 'Use your device location to find your area.'}</p></div><span className="riders-online"><i /> {location ? 'Location detected' : 'Location not set'}</span></div>
          <div className="coverage-layout"><div className="hub-grid"><div className="hub-card"><span className="hub-icon">⌖</span><b>{location || 'Set your location'}</b><small>{coordinates ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : 'Location is required to find nearby restaurants'}</small><button className="explore-hub" type="button" onClick={detectLocation}>Use my location →</button></div></div><div className="map-panel">{coordinates ? <iframe title="Map of your current location" src={`https://www.openstreetmap.org/export/embed.html?bbox=${coordinates.longitude - 0.01}%2C${coordinates.latitude - 0.01}%2C${coordinates.longitude + 0.01}%2C${coordinates.latitude + 0.01}&layer=mapnik&marker=${coordinates.latitude}%2C${coordinates.longitude}`} loading="lazy" /> : <div className="map-lines" aria-hidden="true" />}<span className="map-legend"><i /> {coordinates ? 'Device coordinates detected' : 'Waiting for device location'}</span><div className="map-caption"><b>{location ? `Your area: ${location}` : 'Find your delivery area'}</b><span>{coordinates ? 'Map centered on your current location.' : 'Allow location access to identify your current area.'}</span>{coordinates && <a href={`https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=16/${coordinates.latitude}/${coordinates.longitude}`} target="_blank" rel="noreferrer">Open map →</a>}</div></div></div>
        </section>
      </main>

      <footer className="site-footer"><div className="footer-bottom"><span>Restaurant discovery</span><span className="api-status" title={backendMessage}><i className={backendMessage === 'Store service offline' ? 'offline' : ''} /> {backendMessage === 'Store service offline' ? 'Service offline' : 'Service online'}</span><a href="#top">Back to top</a></div></footer>
    </div>
  )
}

export default App