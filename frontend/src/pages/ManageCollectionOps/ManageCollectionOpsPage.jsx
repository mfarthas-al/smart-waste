import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, CardContent, Chip, Divider, LinearProgress } from '@mui/material'
import { Loader2, MapPinned, Share2, FileDown, ShieldCheck, Gauge, Timer, Route as RouteIcon, Truck } from 'lucide-react'
import RouteMap from './RouteMap.jsx'
import ZoneSelector from '../RouteOptimization/ZoneSelector.jsx'
import MiniZoneMap from '../RouteOptimization/MiniZoneMap.jsx'
import KpiCard from '../RouteOptimization/KpiCard.jsx'
import SummaryCard from '../RouteOptimization/SummaryCard.jsx'
import ProgressSteps from '../RouteOptimization/ProgressSteps.jsx'

const FALLBACK_CITIES = [
  {
    name: 'Homagama',
    depot: { lat: 6.8442, lon: 80.0031 },
    bbox: [[6.8200, 79.9500], [6.9000, 80.0400]],
    areaSqKm: 13.6,
    population: 91000,
    lastCollectionAt: null,
  },
  {
    name: 'Borella',
    depot: { lat: 6.9147, lon: 79.8733 },
    bbox: [[6.9000, 79.8600], [6.9350, 79.9000]],
    areaSqKm: 9.4,
    population: 118000,
    lastCollectionAt: null,
  },
  {
    name: 'Rajagiriya',
    depot: { lat: 6.9105, lon: 79.8875 },
    bbox: [[6.8950, 79.8700], [6.9400, 79.9200]],
    areaSqKm: 7.8,
    population: 76000,
    lastCollectionAt: null,
  },
]

const PROGRESS_TEMPLATE = [
  { label: 'Gathering bin telemetry', status: 'idle' },
  { label: 'Balancing truck loads', status: 'idle' },
  { label: 'Sequencing optimal route', status: 'idle' },
  { label: 'Finalizing dispatch plan', status: 'idle' },
]

const formatDateLabel = value => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatDuration = minutes => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes <= 0) {
    return '—'
  }
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hrs === 0) {
    return `${mins} min`
  }
  if (mins === 0) {
    return `${hrs} hr`
  }
  return `${hrs} hr ${mins} min`
}

export default function ManageCollectionOpsPage() {
  const [cities, setCities] = useState([])
  const [city, setCity] = useState('')
  const [plan, setPlan] = useState(null)
  const [directions, setDirections] = useState(null)
  const [bins, setBins] = useState([])
  const [zoneDetails, setZoneDetails] = useState({ totalBins: '—', areaSize: '—', population: '—', lastCollection: '—' })
  const [progressSteps, setProgressSteps] = useState(PROGRESS_TEMPLATE.map(step => ({ ...step })))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastOptimizedAt, setLastOptimizedAt] = useState(null)

  useEffect(() => {
    let ignore = false
    async function loadCities() {
      try {
        const res = await fetch('/api/ops/cities')
        if (!res.ok) {
          throw new Error(`Failed to load cities (${res.status})`)
        }
        const data = await res.json()
        if (!ignore) {
          const list = Array.isArray(data) && data.length ? data : FALLBACK_CITIES
          setCities(list)
          setCity(list[0]?.name || '')
        }
      } catch (err) {
        console.error('loadCities error', err)
        if (!ignore) {
          setCities(FALLBACK_CITIES)
          setCity(FALLBACK_CITIES[0]?.name || '')
        }
      }
    }

    loadCities()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!city) return
    let ignore = false

    async function loadBins() {
      try {
        const res = await fetch(`/api/ops/bins?city=${encodeURIComponent(city)}`)
        if (!res.ok) {
          throw new Error(`Failed to load bins (${res.status})`)
        }
        const data = await res.json()
        if (!ignore) {
          setBins(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error('loadBins error', err)
        if (!ignore) {
          setBins([])
        }
      }
    }

    loadBins()
    return () => {
      ignore = true
    }
  }, [city])

  useEffect(() => {
    setPlan(null)
    setDirections(null)
    setError('')
    setLastOptimizedAt(null)
    setProgressSteps(PROGRESS_TEMPLATE.map(step => ({ ...step })))
  }, [city])

  const selectedCity = useMemo(() => cities.find(entry => entry.name === city), [cities, city])
  const currentDepot = plan?.depot ?? selectedCity?.depot
  const depotLat = currentDepot?.lat ? currentDepot.lat.toFixed(3) : '—'
  const depotLon = currentDepot?.lon ? currentDepot.lon.toFixed(3) : '—'
  const capacityLimit = plan?.summary?.truckCapacityKg ?? 3000

  useEffect(() => {
    if (!selectedCity) {
      setZoneDetails({ totalBins: bins.length || '—', areaSize: '—', population: '—', lastCollection: '—' })
      return
    }
    const totalBins = bins.length > 0 ? bins.length : '—'
    const area = typeof selectedCity.areaSqKm === 'number'
      ? selectedCity.areaSqKm.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : '—'
    const population = typeof selectedCity.population === 'number'
      ? selectedCity.population.toLocaleString()
      : '—'
    const lastCollection = formatDateLabel(selectedCity.lastCollectionAt)

    setZoneDetails({
      totalBins,
      areaSize: area,
      population,
      lastCollection,
    })
  }, [selectedCity, bins.length])

  async function optimize() {
    if (!city) return
    setLoading(true)
    setError('')
    setProgressSteps(PROGRESS_TEMPLATE.map((step, index) => ({ ...step, status: index === 0 ? 'active' : 'idle' })))
    try {
      const res = await fetch('/api/ops/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city }),
      })

      if (!res.ok) {
        throw new Error(`Optimize failed with status ${res.status}`)
      }

      const data = await res.json()
      const normalized = {
        ...data,
        depot: data.depot || selectedCity?.depot || null,
        summary: data.summary || {},
      }
      setPlan(normalized)
      setLastOptimizedAt(new Date())
      setProgressSteps(PROGRESS_TEMPLATE.map(step => ({ ...step, status: 'done' })))

      if (normalized.truckId) {
        try {
          const dirRes = await fetch(`/api/ops/routes/${encodeURIComponent(normalized.truckId)}/directions`)
          if (!dirRes.ok) {
            throw new Error(`Directions failed (${dirRes.status})`)
          }
          const directionsData = await dirRes.json()
          setDirections(directionsData)
        } catch (directionErr) {
          console.error('directions error', directionErr)
          setDirections(null)
        }
      } else {
        setDirections(null)
      }
    } catch (err) {
      console.error('optimize error', err)
      setError('Could not optimize right now. Please try again in a moment.')
      setProgressSteps(PROGRESS_TEMPLATE.map(step => ({ ...step })))
    } finally {
      setLoading(false)
    }
  }

  const loadProgress = plan && capacityLimit > 0
    ? Math.min(100, Math.round(((plan.loadKg ?? 0) / capacityLimit) * 100))
    : null

  const waypoints = plan?.stops ?? []
  const totalDistanceKm = directions?.distanceKm ?? plan?.distanceKm ?? 0
  const avgLegDistance = plan && plan.stops?.length
    ? (totalDistanceKm / Math.max(plan.stops.length, 1)).toFixed(2)
    : '—'
  const capacityBuffer = plan ? Math.max(0, capacityLimit - (plan.loadKg || 0)) : null

  const kpis = useMemo(() => {
    const stops = plan?.stops?.length ?? (loading ? '…' : '—')
    const distanceLabel = totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(1)} km` : loading ? '…' : '—'
    const durationLabel = directions?.durationMin ? formatDuration(directions.durationMin) : loading ? '…' : '—'
    const loadLabel = plan ? `${plan.loadKg ?? 0} kg` : loading ? '…' : '—'
    const thresholdLabel = plan?.summary?.threshold
      ? `Threshold ≥ ${Math.round(plan.summary.threshold * 100)}%`
      : 'Current settings'

    return [
      {
        label: 'Stops scheduled',
        value: stops,
        helper: plan ? `${plan.summary?.consideredBins ?? stops} bins considered` : 'Awaiting latest plan',
        icon: MapPinned,
      },
      {
        label: 'Predicted distance',
        value: distanceLabel,
        helper: directions?.line ? 'OSRM estimated distance' : 'Based on plan metrics',
        icon: RouteIcon,
      },
      {
        label: 'Estimated duration',
        value: durationLabel,
        helper: directions?.line ? 'Live traffic heuristics' : 'Configure directions to enable ETA',
        icon: Timer,
      },
      {
        label: 'Load collected',
        value: loadLabel,
        helper: plan ? `Capacity ${capacityLimit} kg • ${thresholdLabel}` : thresholdLabel,
        icon: Gauge,
      },
    ]
  }, [plan, directions, loading, capacityLimit, totalDistanceKm])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
      <section className="glass-panel rounded-4xl p-8 shadow-xl shadow-brand-500/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-slate-900">Manage Collection Operations</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Select a city cluster, run the optimizer, and dispatch crews with the latest demand and capacity guidance.</p>
          </div>
          <Chip
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Service level normal"
            color="success"
            variant="outlined"
            sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none' }}
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-6">
            <ZoneSelector
              cities={cities}
              selectedCity={city}
              zoneDetails={zoneDetails}
              onSelectCity={setCity}
              onGenerate={optimize}
              loading={loading}
              actionLabel="Generate Optimized Route"
            />

            {error && (
              <Alert severity="error" variant="outlined">{error}</Alert>
            )}

            {loading && <ProgressSteps steps={progressSteps} />}

            {cities.length > 0 && (
              <MiniZoneMap cities={cities} selectedCity={city} onSelectCity={setCity} />
            )}

            <Card className="rounded-3xl border border-slate-200/70 bg-white/90">
              <CardContent className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <MapPinned className="h-3.5 w-3.5 text-emerald-500" />
                  Depot: {selectedCity?.name ?? '—'} ({depotLat} · {depotLon})
                </span>
                {lastOptimizedAt && <span>Last run: {lastOptimizedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                <span className="inline-flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-slate-500" />
                  Truck default: {plan?.truckId || 'TRUCK-01'}
                </span>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {kpis.map(kpi => (
                <KpiCard
                  key={kpi.label}
                  icon={kpi.icon}
                  label={kpi.label}
                  value={kpi.value}
                  helper={kpi.helper}
                />
              ))}
            </div>

            <SummaryCard plan={plan} summary={plan?.summary} directions={directions} />

            <Card className="glass-panel rounded-3xl border border-slate-200/70 bg-slate-950/95 text-slate-100 shadow-lg shadow-slate-900/40">
              <CardContent className="space-y-5 p-6">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">Crew briefing</h3>
                <p className="text-sm text-slate-300">Provide this summary to the {plan?.truckId || 'TRUCK-01'} crew before dispatch. Ensure fuel levels support a {totalDistanceKm ? `${totalDistanceKm.toFixed(1)} km` : '—'} circuit.</p>
                <Divider light sx={{ borderColor: 'rgba(148, 163, 184, 0.18)' }} />
                <div className="space-y-4 text-sm">
                  <div className="rounded-2xl bg-slate-900/70 px-4 py-3">
                    <p className="font-semibold text-white">Priority guidance</p>
                    <p className="mt-1 text-slate-400">Visit bins in listed order; overflow risk is highest for the first three stops.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-900/70 px-4 py-3">
                    <p className="font-semibold text-white">Contingency</p>
                    <p className="mt-1 text-slate-400">If load exceeds capacity, divert to secondary truck TRUCK-02 after stop #5.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-panel rounded-3xl border border-slate-200/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Route timeline</h3>
              <span className="text-xs uppercase tracking-wide text-slate-500">{waypoints.length} stops</span>
            </div>

            {plan && (
              <div className="mt-6">
                <RouteMap plan={plan} depot={currentDepot} />
              </div>
            )}

            <ol className="mt-6 space-y-3">
              {loading && (
                <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  Calculating best route…
                </li>
              )}
              {!loading && waypoints.length === 0 && (
                <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-500">
                  Run an optimization to generate a stop list for today&apos;s shift.
                </li>
              )}
              {waypoints.map((stop, index) => {
                const lat = typeof stop.lat === 'number' ? stop.lat.toFixed(4) : '—'
                const lon = typeof stop.lon === 'number' ? stop.lon.toFixed(4) : '—'
                const estKg = typeof stop.estKg === 'number' ? stop.estKg : '—'
                return (
                  <li key={stop.binId} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-700">{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{stop.binId}</p>
                        <p className="text-xs text-slate-500">Lat {lat} · Lon {lon}</p>
                      </div>
                      <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {estKg} kg
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="rounded-3xl border border-slate-200 bg-slate-50/80 shadow-inner">
            <CardContent className="space-y-4 p-6 text-sm text-slate-600">
              <h3 className="text-lg font-semibold text-slate-900">Operational insights</h3>
              <ul className="space-y-3">
                <li>• Average leg distance: {avgLegDistance} km</li>
                <li>• Capacity buffer: {capacityBuffer !== null ? `${capacityBuffer} kg remaining` : 'Awaiting plan'}</li>
                <li>• Suggested dispatch: {plan ? '05:30 local time' : 'Schedule after plan is ready'}</li>
              </ul>
              {plan && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Capacity utilization</p>
                  <LinearProgress
                    variant="determinate"
                    value={loadProgress ?? 0}
                    sx={{ borderRadius: 999, height: 6, backgroundColor: 'rgba(148, 163, 184, 0.25)', '& .MuiLinearProgress-bar': { backgroundColor: '#0ea5e9' } }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-3xl border border-slate-200/70 text-sm text-slate-600">
            <CardContent className="space-y-4 p-6">
              <h3 className="text-lg font-semibold text-slate-900">Share with teammates</h3>
              <p>Export the run sheet to notify supervisors and the {plan?.truckId || 'TRUCK-01'} driver.</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outlined"
                  startIcon={<FileDown className="h-4 w-4" />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
                >
                  Download PDF
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Share2 className="h-4 w-4" />}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
                >
                  Notify via SMS
                </Button>
              </div>
              <Divider light />
              <p className="text-xs text-slate-400">Integrations coming soon for WhatsApp and email digests.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
