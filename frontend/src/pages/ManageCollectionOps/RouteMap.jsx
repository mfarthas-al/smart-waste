// RouteMap.jsx
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// simple numbered marker with Tailwind-like styles (works without Tailwind too)
function numberIcon(n, color = '#10b981') {
  return L.divIcon({
    className: 'numbered-marker',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        display:grid;place-items:center;
        background:${color}1A;border:1px solid ${color}66;color:#0f172a;
        font:600 12px/1 Inter,system-ui,sans-serif;">
        ${n}
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function depotIcon() {
  return L.divIcon({
    className: 'depot-marker',
    html: `
      <div style="
        padding:6px 10px;border-radius:9999px;background:#111827;color:#fff;
        border:1px solid #94a3b8">
        DEPOT
      </div>`,
    iconSize: [50, 24],
    iconAnchor: [25, 12],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [30, 30] });
  }, [points, map]);
  return null;
}

/**
 * props:
 *  - plan: { stops:[{lat,lon,binId,estKg,visited}], ... }
 *  - depot: { lat, lon }
 */
export default function RouteMap({ plan, depot }) {
  const stops = plan?.stops ?? [];
  const poly = useMemo(() => {
    if (!stops.length) return [];
    const pts = [[depot.lat, depot.lon], ...stops.map(s => [s.lat, s.lon]), [depot.lat, depot.lon]];
    return pts;
  }, [stops, depot]);

  // center (fallback to depot)
  const center = [depot.lat, depot.lon];

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Path depot → stops → depot */}
        {poly.length >= 2 && (
          <Polyline positions={poly} pathOptions={{ color: '#10b981', weight: 5, opacity: 0.8 }} />
        )}

        {/* Depot */}
        <Marker position={[depot.lat, depot.lon]} icon={depotIcon()}>
          <Popup>Depot<br/>Start/End</Popup>
        </Marker>

        {/* Numbered stop markers */}
        {stops.map((s, i) => (
          <Marker
            key={s.binId}
            position={[s.lat, s.lon]}
            icon={numberIcon(i + 1, s.visited ? '#16a34a' : '#10b981')}
          >
            <Popup>
              <div style={{ fontWeight: 600 }}>{s.binId}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {s.lat.toFixed(4)}, {s.lon.toFixed(4)}<br/>
                {s.estKg} kg {s.visited ? '• visited' : ''}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Fit map to all points */}
        <FitBounds points={poly} />
      </MapContainer>
    </div>
  );
}
