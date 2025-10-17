import { MapContainer, TileLayer, Rectangle, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import L from 'leaflet'

function Fit({ bbox }) {
  const map = useMap()
  useEffect(() => {
    if (!bbox) return
    const bounds = L.latLngBounds(bbox)
    map.fitBounds(bounds, { padding: [20, 20] })
  }, [bbox, map])
  return null
}

export default function MiniZoneMap({ cities, selectedCity, onSelectCity }) {
  const active = cities.find(city => city.name === selectedCity)
  const defaultBBox = active?.bbox || cities[0]?.bbox

  return (
    <div className="h-64 overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={[6.927, 79.861]}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cities.map(city => (
          <Rectangle
            key={city.name}
            bounds={city.bbox || [[city.depot.lat - 0.01, city.depot.lon - 0.01], [city.depot.lat + 0.01, city.depot.lon + 0.01]]}
            eventHandlers={{
              click: () => onSelectCity(city.name),
            }}
            pathOptions={{
              color: city.name === selectedCity ? '#10b981' : '#64748b',
              weight: 2,
              fillOpacity: 0.1,
            }}
          >
            <Popup>{city.name}</Popup>
          </Rectangle>
        ))}
        <Fit bbox={defaultBBox} />
      </MapContainer>
    </div>
  )
}
