import { useMemo, useState } from 'react'
import { Alert, Button, Card, CardContent, Chip, Divider, LinearProgress, Tooltip } from '@mui/material'
import { Loader2, MapPinned, RefreshCw, Share2, FileDown, ShieldCheck } from 'lucide-react'

export default function ManageCollectionOpsPage() {
  const [ward, setWard] = useState('CMC-W05')
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastOptimizedAt, setLastOptimizedAt] = useState(null)
  const capacityLimit = 3000

  async function optimize() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/ops/routes/optimize', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ ward })
    })
    if (!res.ok) {
      setLoading(false)
      setError('Could not optimize right now. Please try again in a moment.')
      return
    }
    const data = await res.json()
    setPlan(data)
    setLastOptimizedAt(new Date())
    setLoading(false)
  }

  const loadProgress = plan ? Math.min(100, Math.round(((plan.loadKg ?? 0) / capacityLimit) * 100)) : null

  const summary = useMemo(() => {
    if (!plan) {
      return [
        { label: 'Stops scheduled', value: '—', helper: 'Run an optimization to populate' },
        { label: 'Total load', value: '—', helper: 'Kg of estimated collections' },
        { label: 'Total distance', value: '—', helper: 'Round trip in kilometers' },
      ]
    }
    return [
      { label: 'Stops scheduled', value: plan.stops?.length ?? 0, helper: 'Bins meeting threshold' },
      { label: 'Total load', value: `${plan.loadKg ?? 0} kg`, helper: 'Estimated pickup weight', progress: loadProgress ?? 0 },
      { label: 'Total distance', value: `${plan.distanceKm ?? 0} km`, helper: 'Projected travel distance' },
    ]
  }, [plan, loadProgress])

  const waypoints = plan?.stops ?? []
  const avgLegDistance = plan && plan.stops?.length ? (plan.distanceKm / plan.stops.length).toFixed(2) : '—'
  const capacityBuffer = plan ? Math.max(0, capacityLimit - (plan.loadKg || 0)) : null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
      <section className="glass-panel rounded-4xl p-8 shadow-xl shadow-brand-500/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-slate-900">Manage Collection Operations</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Select a ward to generate an optimized truck route based on fill thresholds, collection capacity, and proximity to the depot.</p>
          </div>
          <Chip
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Service level normal"
            color="success"
            variant="outlined"
            sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none' }}
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="glass-panel rounded-3xl border border-slate-200/70">
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="text-xs uppercase tracking-wide text-slate-500">Ward focus</label>
                  <Tooltip title="Ward with highest bin density" placement="top" arrow>
                    <select className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none" value={ward} onChange={e=>setWard(e.target.value)}>
                      <option>CMC-W05</option>
                      <option>CMC-W06</option>
                    </select>
                  </Tooltip>
                  <Button
                    onClick={optimize}
                    disabled={loading}
                    variant="contained"
                    color="success"
                    startIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none', px: 3 }}
                  >
                    {loading ? 'Optimizing route' : 'Run optimization'}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2"><MapPinned className="h-3.5 w-3.5 text-brand-500" />Depot: Peliyagoda Transfer Station</span>
                  {lastOptimizedAt && <span>Last run: {lastOptimizedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  <span>Truck default: {plan?.truckId || 'TRUCK-01'}</span>
                </div>
                {error && <Alert severity="error" variant="outlined">{error}</Alert>}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              {summary.map(item => (
                <Tooltip key={item.label} title={item.helper} arrow enterDelay={150}>
                  <Card className="rounded-3xl border border-slate-200/80 bg-slate-50/90 shadow-inner">
                    <CardContent className="space-y-3 p-5">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
                      {typeof item.progress === 'number' ? (
                        <div className="space-y-2">
                          <LinearProgress
                            variant="determinate"
                            value={item.progress}
                            sx={{ borderRadius: 999, height: 6, backgroundColor: 'rgba(148, 163, 184, 0.25)', '& .MuiLinearProgress-bar': { backgroundColor: '#10b981' } }}
                          />
                          <p className="text-xs text-slate-500">{item.helper}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">{item.helper}</p>
                      )}
                    </CardContent>
                  </Card>
                </Tooltip>
              ))}
            </div>
          </div>

          <Card className="glass-panel rounded-3xl border border-slate-200/70 bg-slate-950/95 text-slate-100 shadow-lg shadow-slate-900/40">
            <CardContent className="space-y-5 p-6">
              <h3 className="text-sm uppercase tracking-wide text-slate-400">Crew briefing</h3>
              <p className="text-sm text-slate-300">Provide this summary to the TRUCK-01 crew before dispatch. Ensure fuel levels support a {summary[2].value} circuit.</p>
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
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-panel rounded-3xl border border-slate-200/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Route timeline</h3>
              <span className="text-xs uppercase tracking-wide text-slate-500">{waypoints.length} stops</span>
            </div>

            <ol className="mt-6 space-y-3">
              {loading && (
                <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                  Calculating best route…
                </li>
              )}
              {!loading && waypoints.length === 0 && (
                <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-500">
                  Run an optimization to generate a stop list for today&apos;s shift.
                </li>
              )}
              {waypoints.map((stop, index) => (
                <li key={stop.binId} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-700">{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{stop.binId}</p>
                      <p className="text-xs text-slate-500">Lat {stop.lat.toFixed(4)} · Lon {stop.lon.toFixed(4)}</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {stop.estKg} kg
                    </span>
                  </div>
                </li>
              ))}
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
              <p>Export the run sheet to notify supervisors and the TRUCK-01 driver.</p>
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
