import { Button, MenuItem, Select } from '@mui/material'

export default function ZoneSelector({
  cities,
  selectedCity,
  zoneDetails,
  onSelectCity,
  onGenerate,
  loading,
  actionLabel = 'Generate Optimized Route',
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">City / Zone</p>
          <Select
            fullWidth
            value={selectedCity || ''}
            onChange={event => onSelectCity(event.target.value)}
            size="small"
            sx={{ mt: 1, borderRadius: '999px' }}
          >
            {cities.map(city => (
              <MenuItem key={city.name} value={city.name}>{city.name}</MenuItem>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>Total bins</span>
            <span className="font-semibold text-slate-900">{zoneDetails.totalBins ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Area size</span>
            <span className="font-semibold text-slate-900">{zoneDetails.areaSize ?? '—'} km²</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Population</span>
            <span className="font-semibold text-slate-900">{zoneDetails.population ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last collection</span>
            <span className="font-semibold text-slate-900">{zoneDetails.lastCollection ?? '—'}</span>
          </div>
        </div>

        <Button
          variant="contained"
          color="success"
          onClick={onGenerate}
          disabled={loading || !selectedCity}
          sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none', py: 1.2 }}
        >
          {loading ? 'Calculating…' : actionLabel}
        </Button>
      </div>
    </div>
  )
}
