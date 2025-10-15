import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CardHeader, Chip, CircularProgress, Divider, FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography, } from '@mui/material'
import { Save, SlidersHorizontal, BarChart3, LineChart, PieChart, Download } from 'lucide-react'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'

const sectionSwitches = [
  { key: 'households', label: 'Household table' },
  { key: 'regions', label: 'Region breakdown' },
  { key: 'wasteTypes', label: 'Waste composition' },
  { key: 'timeline', label: 'Trend timeline' },
]

const defaultVisibility = {
  households: true,
  regions: true,
  wasteTypes: true,
  timeline: true,
}

function formatKg(value) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
}

function HorizontalMetricBar({ label, value, maxValue, accent }) {
  const width = maxValue === 0 ? 0 : Math.round((value / maxValue) * 100)
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{formatKg(value)}</Typography>
      </Stack>
      <Box sx={{ height: 10, borderRadius: '999px', bgcolor: 'rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
        <Box sx={{ width: `${width}%`, height: '100%', background: accent ?? '#10b981' }} />
      </Box>
    </Stack>
  )
}

function TimelineSparkline({ data }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(point => point.totalKg)) || 1
  return (
    <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ minHeight: 120, width: '100%' }}>
      {data.map(point => {
        const height = Math.max(6, Math.round((point.totalKg / max) * 100))
        return (
          <Stack key={point.day} spacing={0.5} alignItems="center" sx={{ flex: 1 }}>
            <Box sx={{ width: '100%', height: height, borderRadius: '8px 8px 2px 2px', bgcolor: 'rgba(16, 185, 129, 0.55)' }} />
            <Typography variant="caption" color="text.secondary">
              {new Date(point.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}

export default function ReportsPage({ session }) {
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    regions: [],
    wasteTypes: [],
    billingModels: [],
  })
  const [visibility, setVisibility] = useState(defaultVisibility)
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState(null)
  const [noRecordsMessage, setNoRecordsMessage] = useState('')

  useEffect(() => {
    async function loadConfig() {
      setLoadingConfig(true)
      try {
        const response = await fetch('/api/analytics/config')
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.message || 'Unable to load analytics configuration')
        }
        setConfig(data.filters)
        const defaultFrom = data.filters?.defaultDateRange?.from
        const defaultTo = data.filters?.defaultDateRange?.to
        setFilters(prev => ({
          ...prev,
          from: defaultFrom ? new Date(defaultFrom).toISOString().slice(0, 10) : prev.from,
          to: defaultTo ? new Date(defaultTo).toISOString().slice(0, 10) : prev.to,
        }))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [])

  const handleFilterChange = event => {
    const { name, value } = event.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const toggleVisibility = key => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setError(null)
    setNoRecordsMessage('')

    if (!filters.from || !filters.to) {
      setError('Please pick a start and end date before generating the report.')
      return
    }

    setLoadingReport(true)
    try {
      const payload = {
        userId: session?.id || session?._id,
        criteria: {
          dateRange: {
            from: filters.from,
            to: filters.to,
          },
          regions: filters.regions,
          wasteTypes: filters.wasteTypes,
          billingModels: filters.billingModels,
        },
      }

      const response = await fetch('/api/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate report')
      }
      if (!data.data) {
        setReport(null)
        setNoRecordsMessage(data.message || 'No Records Available')
        return
      }
      setReport(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingReport(false)
    }
  }

  const canExport = Boolean(report)

  const handleExport = format => {
    if (!report) return

    if (format === 'pdf') {
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Smart Waste LK – Waste Analytics Report', 14, 20)
      doc.setFontSize(11)
      doc.text(`Period: ${report.criteria.dateRange.from.toString().slice(0, 10)} to ${report.criteria.dateRange.to.toString().slice(0, 10)}`, 14, 30)
      doc.text(`Regions: ${report.criteria.regions?.join(', ') || 'All'}`, 14, 38)
      doc.text(`Waste Types: ${report.criteria.wasteTypes?.join(', ') || 'All'}`, 14, 46)
      doc.text(`Billing Models: ${report.criteria.billingModels?.join(', ') || 'All'}`, 14, 54)

      doc.text('Totals', 14, 68)
      doc.text(`Total records: ${report.totals.records}`, 14, 76)
      doc.text(`Total weight: ${report.totals.totalWeightKg} kg`, 14, 84)
      doc.text(`Recyclable: ${report.totals.recyclableWeightKg} kg`, 14, 92)
      doc.text(`Non-recyclable: ${report.totals.nonRecyclableWeightKg} kg`, 14, 100)

      let cursorY = 116
      const topHouseholds = report.tables.households.slice(0, 10)
      doc.text('Top households by weight', 14, cursorY)
      cursorY += 8
      topHouseholds.forEach(household => {
        doc.text(
          `${household.householdId} • ${household.region} • ${household.totalKg} kg`,
          14,
          cursorY,
        )
        cursorY += 8
      })
      doc.save('smart-waste-analytics.pdf')
    }

    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new()
      const regionSheet = XLSX.utils.json_to_sheet(report.tables.regions)
      XLSX.utils.book_append_sheet(workbook, regionSheet, 'Regions')
      const householdSheet = XLSX.utils.json_to_sheet(report.tables.households)
      XLSX.utils.book_append_sheet(workbook, householdSheet, 'Households')
      const wasteSheet = XLSX.utils.json_to_sheet(report.tables.wasteTypes)
      XLSX.utils.book_append_sheet(workbook, wasteSheet, 'Waste Types')
      XLSX.writeFile(workbook, 'smart-waste-analytics.xlsx')
    }
  }

  const maxRegionValue = useMemo(() => {
    if (!report?.charts?.regionSummary?.length) return 0
    return Math.max(...report.charts.regionSummary.map(item => item.totalKg))
  }, [report])

  const maxWasteValue = useMemo(() => {
    if (!report?.charts?.wasteSummary?.length) return 0
    return Math.max(...report.charts.wasteSummary.map(item => item.totalKg))
  }, [report])

  return (
    <div className="glass-panel mx-auto mt-4 max-w-6xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Stack spacing={5}>
        <Box>
          <Chip
            icon={<BarChart3 size={16} />}
            label="Reports & analytics"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600, borderRadius: '999px' }}
          />
          <Typography variant="h4" fontWeight={600} mt={2} color="text.primary">
            Generate waste insights by region, customer, and billing model
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1.5}>
            Choose your filters to uncover how waste generation is trending across the network. Results update with each run and can be exported for sharing.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {noRecordsMessage && (
          <Alert severity="info" onClose={() => setNoRecordsMessage('')}>
            {noRecordsMessage}
          </Alert>
        )}

        <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
          <CardHeader
            title="Report criteria"
            subheader="Select the dimensions that matter to your analysis."
            action={
              <Stack direction="row" spacing={2} alignItems="center">
                <SlidersHorizontal size={18} className="text-slate-400" />
              </Stack>
            }
            sx={{ pb: 0 }}
          />
          <CardContent>
            {loadingConfig ? (
              <Stack direction="row" spacing={2} alignItems="center">
                <CircularProgress size={22} />
                <Typography variant="body2" color="text.secondary">Loading configuration…</Typography>
              </Stack>
            ) : (
              <Stack component="form" spacing={4} onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="From"
                      name="from"
                      type="date"
                      value={filters.from}
                      onChange={handleFilterChange}
                      required
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="To"
                      name="to"
                      type="date"
                      value={filters.to}
                      onChange={handleFilterChange}
                      required
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="regions-label">Regions</InputLabel>
                      <Select
                        labelId="regions-label"
                        label="Regions"
                        name="regions"
                        multiple
                        value={filters.regions}
                        onChange={handleFilterChange}
                        renderValue={selected => selected.length ? selected.join(', ') : 'All regions'}
                      >
                        {(config?.regions || []).map(region => (
                          <MenuItem key={region} value={region}>
                            {region}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="wasteTypes-label">Waste type</InputLabel>
                      <Select
                        labelId="wasteTypes-label"
                        label="Waste type"
                        name="wasteTypes"
                        multiple
                        value={filters.wasteTypes}
                        onChange={handleFilterChange}
                        renderValue={selected => selected.length ? selected.join(', ') : 'All types'}
                      >
                        {(config?.wasteTypes || []).map(wasteType => (
                          <MenuItem key={wasteType} value={wasteType}>
                            {wasteType}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="billingModels-label">Billing model</InputLabel>
                      <Select
                        labelId="billingModels-label"
                        label="Billing model"
                        name="billingModels"
                        multiple
                        value={filters.billingModels}
                        onChange={handleFilterChange}
                        renderValue={selected => selected.length ? selected.join(', ') : 'All models'}
                      >
                        {(config?.billingModels || []).map(model => (
                          <MenuItem key={model} value={model}>
                            {model}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Stack direction="row" flexWrap="wrap" spacing={3} alignItems="center">
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={loadingReport}
                    startIcon={loadingReport ? <CircularProgress size={18} /> : <BarChart3 size={18} />}
                  >
                    {loadingReport ? 'Crunching numbers…' : 'Generate report'}
                  </Button>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>Show sections:</Typography>
                    {sectionSwitches.map(item => (
                      <FormControlLabel
                        key={item.key}
                        control={<Switch checked={visibility[item.key]} onChange={() => toggleVisibility(item.key)} size="small" />}
                        label={<Typography variant="body2" color="text.secondary">{item.label}</Typography>}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>

        {report && (
          <Stack spacing={4}>
            <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={600}>Report summary</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(report.criteria.dateRange.from).toLocaleDateString()} → {new Date(report.criteria.dateRange.to).toLocaleDateString()} | {report.criteria.regions?.length ? report.criteria.regions.join(', ') : 'All regions'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Download size={16} />} onClick={() => handleExport('pdf')} disabled={!canExport}>
                      Export PDF
                    </Button>
                    <Button variant="contained" startIcon={<Save size={16} />} onClick={() => handleExport('xlsx')} disabled={!canExport}>
                      Export Excel
                    </Button>
                  </Stack>
                </Stack>

                <Grid container spacing={3} mt={1}>
                  <Grid item xs={12} md={3}>
                    <Card className="rounded-2xl border border-slate-100 bg-slate-50/60 shadow-sm">
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">Total pickups</Typography>
                        <Typography variant="h5" fontWeight={600}>{report.totals.records}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card className="rounded-2xl border border-slate-100 bg-slate-50/60 shadow-sm">
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">Total weight</Typography>
                        <Typography variant="h5" fontWeight={600}>{formatKg(report.totals.totalWeightKg)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card className="rounded-2xl border border-slate-100 bg-slate-50/60 shadow-sm">
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">Recyclable</Typography>
                        <Typography variant="h5" fontWeight={600}>{formatKg(report.totals.recyclableWeightKg)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card className="rounded-2xl border border-slate-100 bg-slate-50/60 shadow-sm">
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">Non-recyclable</Typography>
                        <Typography variant="h5" fontWeight={600}>{formatKg(report.totals.nonRecyclableWeightKg)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {visibility.regions && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-brand-600" />}
                  title="Region-wise waste analysis"
                  subheader="Compare waste volumes across the selected regions"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.charts.regionSummary || []).map(region => (
                      <HorizontalMetricBar
                        key={region.region}
                        label={region.region}
                        value={region.totalKg}
                        maxValue={maxRegionValue}
                        accent="linear-gradient(90deg, rgba(16,185,129,0.65) 0%, rgba(14,165,233,0.5) 100%)"
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {visibility.wasteTypes && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-amber-500" />}
                  title="Recyclable vs non-recyclable"
                  subheader="Waste composition across the chosen filters"
                />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Stack spacing={2}>
                        {(report.charts.wasteSummary || []).map(item => (
                          <HorizontalMetricBar
                            key={item.wasteType}
                            label={item.wasteType}
                            value={item.totalKg}
                            maxValue={maxWasteValue}
                            accent="linear-gradient(90deg, rgba(244,114,182,0.65) 0%, rgba(251,191,36,0.55) 100%)"
                          />
                        ))}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Box className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Split snapshot</Typography>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ width: 16, height: 16, borderRadius: '999px', bgcolor: 'rgba(16, 185, 129, 0.7)' }} />
                            <Typography variant="body2">Recyclable {formatKg(report.totals.recyclableWeightKg)}</Typography>
                          </Stack>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ width: 16, height: 16, borderRadius: '999px', bgcolor: 'rgba(239, 68, 68, 0.7)' }} />
                            <Typography variant="body2">Non-recyclable {formatKg(report.totals.nonRecyclableWeightKg)}</Typography>
                          </Stack>
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            {visibility.timeline && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<LineChart className="h-5 w-5 text-sky-500" />}
                  title="Trend over time"
                  subheader="Track the daily waste collected for the selected filters"
                />
                <CardContent>
                  <TimelineSparkline data={report.charts.timeSeries} />
                </CardContent>
              </Card>
            )}

            {visibility.households && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<BarChart3 className="h-5 w-5 text-brand-600" />}
                  title="Waste generated per household"
                  subheader="Top contributors by total kilograms"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.tables.households || []).slice(0, 12).map(household => (
                      <Box
                        key={household.householdId}
                        className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3"
                      >
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                          <Stack spacing={0.25}>
                            <Typography variant="subtitle1" fontWeight={600}>{household.householdId}</Typography>
                            <Typography variant="body2" color="text.secondary">{household.region} • {household.billingModel}</Typography>
                          </Stack>
                          <Stack direction="row" spacing={3}>
                            <Chip label={`${household.pickups} pickups`} variant="outlined" color="default" />
                            <Chip label={formatKg(household.totalKg)} color="success" />
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="caption" color="text.secondary">
                    Showing top {Math.min((report.tables.households || []).length, 12)} of {(report.tables.households || []).length} households by total collected weight.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </Stack>
    </div>
  )
}
