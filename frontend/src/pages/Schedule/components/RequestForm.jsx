import { useCallback, useMemo } from 'react'
import dayjs from 'dayjs'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { DigitalClock } from '@mui/x-date-pickers/DigitalClock'
import { CalendarClock, Info, MailCheck, RefreshCcw } from 'lucide-react'
import { toLocalDateValue } from '../utils.js'

export function RequestForm({
  form,
  allowedItems,
  selectedPolicy,
  onChange,
  onSubmit,
  availabilityLoading,
  isAuthenticated,
  onRequireAuth,
  errors,
  touched,
  onBlur,
  onReset,
  isFormValid,
  slotConfig,
}) {
  const dateValue = useMemo(() => (form.preferredDate ? dayjs(form.preferredDate) : null), [form.preferredDate])
  const timeValue = useMemo(() => (form.preferredTime ? dayjs(`1970-01-01T${form.preferredTime}`) : null), [form.preferredTime])

  const handleDateChange = useCallback((newValue) => {
    const formatted = newValue && newValue.isValid() ? newValue.format('YYYY-MM-DD') : ''
    onChange({ target: { name: 'preferredDate', value: formatted } })
  }, [onChange])

  const handleTimeChange = useCallback((newValue) => {
    const formatted = newValue && newValue.isValid() ? newValue.format('HH:mm') : ''
    onChange({ target: { name: 'preferredTime', value: formatted } })
  }, [onChange])

  const pickerBoxSx = {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    p: 1,
    minHeight: 340,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const maxDaysAhead = slotConfig?.daysAhead ?? 30
  const disableWeekends = Boolean(slotConfig?.disableWeekends)
  const hoursStart = slotConfig?.hours?.start ?? '08:00'
  const hoursEnd = slotConfig?.hours?.end ?? '18:00'
  const minDate = dayjs().startOf('day')
  const maxDate = dayjs().add(maxDaysAhead, 'day')
  const minTime = dayjs(`1970-01-01T${hoursStart}`)
  const maxTime = dayjs(`1970-01-01T${hoursEnd}`)

  const setQuickDate = useCallback((when) => {
    let d = dayjs().startOf('day')
    if (when === 'tomorrow') {
      d = d.add(1, 'day')
    }
    if (when === 'nextMon') {
      const daysUntilMon = (8 - d.day()) % 7 || 7
      d = d.add(daysUntilMon, 'day')
    }
    onChange({ target: { name: 'preferredDate', value: d.format('YYYY-MM-DD') } })
  }, [onChange])

  const setQuickTime = useCallback((hhmm) => {
    onChange({ target: { name: 'preferredTime', value: hhmm } })
  }, [onChange])

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack component="form" spacing={4} onSubmit={onSubmit}>
          <Typography variant="h6" fontWeight={600}>
            Request details
          </Typography>

          <Box sx={{ px: { xs: 1.5, md: 1.5 } }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Resident name"
                  name="residentName"
                  value={form.residentName}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  error={Boolean(touched.residentName && errors.residentName)}
                  helperText={touched.residentName && errors.residentName}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Owner's name"
                  name="ownerName"
                  value={form.ownerName}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  error={Boolean(touched.ownerName && errors.ownerName)}
                  helperText={touched.ownerName && errors.ownerName}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  error={Boolean(touched.email && errors.email)}
                  helperText={touched.email && errors.email}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Phone"
                  name="phone"
                  value={form.phone}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  type="tel"
                  inputProps={{ pattern: '[0-9()+ -]{7,}' }}
                  error={Boolean(touched.phone && errors.phone)}
                  helperText={touched.phone && errors.phone}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Address"
                  name="address"
                  value={form.address}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  error={Boolean(touched.address && errors.address)}
                  helperText={touched.address && errors.address}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="District"
                  name="district"
                  value={form.district}
                  onChange={onChange}
                  onBlur={onBlur}
                  required
                  fullWidth
                  error={Boolean(touched.district && errors.district)}
                  helperText={touched.district && errors.district}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth required>
                  <InputLabel id="itemType-label">Item type</InputLabel>
                  <Select
                    labelId="itemType-label"
                    name="itemType"
                    label="Item type"
                    value={form.itemType}
                    onChange={onChange}
                    disabled={!allowedItems.length}
                  >
                    {allowedItems.map(item => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Approx. weight (kg per item)"
                  name="approxWeight"
                  type="number"
                  value={form.approxWeight}
                  onChange={onChange}
                  onBlur={onBlur}
                  inputProps={{ min: 0, step: 0.1 }}
                  required
                  fullWidth
                  error={Boolean(touched.approxWeight && errors.approxWeight)}
                  helperText={touched.approxWeight && errors.approxWeight}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Quantity"
                  name="quantity"
                  type="number"
                  value={form.quantity}
                  onChange={onChange}
                  onBlur={onBlur}
                  inputProps={{ min: 1 }}
                  required
                  fullWidth
                  error={Boolean(touched.quantity && errors.quantity)}
                  helperText={touched.quantity && errors.quantity}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.25} sx={{ height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 700 }}>
                    Set Date:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip size="small" label="Today" onClick={() => setQuickDate('today')} variant="outlined" />
                    <Chip size="small" label="Tomorrow" onClick={() => setQuickDate('tomorrow')} variant="outlined" />
                    <Chip size="small" label="Next Mon" onClick={() => setQuickDate('nextMon')} variant="outlined" />
                  </Stack>
                  <Box sx={{ ...pickerBoxSx, flexGrow: 1 }}>
                    <DateCalendar
                      value={dateValue}
                      onChange={handleDateChange}
                      disablePast
                      minDate={minDate}
                      maxDate={maxDate}
                      shouldDisableDate={date => disableWeekends && (date.day() === 0 || date.day() === 6)}
                    />
                  </Box>
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.25} sx={{ height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: 'info.main', fontWeight: 700 }}>
                    Set Time:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip size="small" label="08:00" onClick={() => setQuickTime('08:00')} variant="outlined" />
                    <Chip size="small" label="12:00" onClick={() => setQuickTime('12:00')} variant="outlined" />
                    <Chip size="small" label="15:00" onClick={() => setQuickTime('15:00')} variant="outlined" />
                  </Stack>
                  <Box sx={{ ...pickerBoxSx, flexGrow: 1 }}>
                    <DigitalClock
                      value={timeValue}
                      onChange={handleTimeChange}
                      minTime={minTime}
                      maxTime={maxTime}
                      timeStep={slotConfig?.timeStepMinutes ?? 30}
                    />
                  </Box>
                </Stack>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Special notes"
                  name="specialNotes"
                  value={form.specialNotes}
                  onChange={onChange}
                  onBlur={onBlur}
                  fullWidth
                  multiline
                  minRows={2}
                  placeholder="Add access details or extra instructions for the crew"
                />
              </Grid>
            </Grid>
          </Box>

          {selectedPolicy ? (
            <Alert severity="info" icon={<Info size={18} />} sx={{ borderRadius: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <CalendarClock size={20} />
                <Box>
                  <Typography fontWeight={600}>{selectedPolicy.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedPolicy.description || 'Collection policy details unavailable.'}
                  </Typography>
                </Box>
              </Stack>
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Reset form fields">
                <IconButton onClick={onReset}>
                  <RefreshCcw size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Auto-fill contact details with your account info">
                <IconButton onClick={() => {
                  const now = new Date()
                  onChange({ target: { name: 'preferredDate', value: toLocalDateValue(now) } })
                }}>
                  <MailCheck size={18} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
              {!isAuthenticated ? (
                <Button variant="outlined" onClick={onRequireAuth} startIcon={<CalendarClock size={18} />}>
                  Sign in to schedule
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="contained"
                disabled={!isAuthenticated || !isFormValid || availabilityLoading}
                startIcon={<CalendarClock size={18} />}
              >
                {availabilityLoading ? 'Checking…' : 'Check availability'}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
