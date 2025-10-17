import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Typography, Stepper, Step, StepLabel, Tooltip } from '@mui/material'
import dayjs from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { CalendarClock, CheckCircle2, Clock3, Info, MailCheck, RefreshCcw, Truck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const initialFormState = {
  residentName: '',
  ownerName: '',
  address: '',
  district: '',
  email: '',
  phone: '',
  itemType: '',
  preferredDate: '',
  preferredTime: '',
  approxWeight: '',
  quantity: 1,
  specialNotes: '',
}

const REQUEST_STATUSES = {
  scheduled: { label: 'Scheduled', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'default' },
  'pending-payment': { label: 'Pending payment', color: 'warning' },
  'payment-failed': { label: 'Payment failed', color: 'error' },
}

const PAYMENT_STATUSES = {
  success: { label: 'Payment success', color: 'success' },
  pending: { label: 'Payment pending', color: 'warning' },
  failed: { label: 'Payment failed', color: 'error' },
  'not-required': { label: 'No payment required', color: 'default' },
}

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const TAX_RATE_PERCENT = 3

function formatCurrency(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return currencyFormatter.format(0)
  return currencyFormatter.format(value)
}

function toLocalDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function combineDateAndTime(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

function serializeDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function formatRequestTimestamp(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatSlotRange(slot) {
  if (!slot?.start) return 'Awaiting assignment'
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const start = formatter.format(new Date(slot.start))
    const end = slot.end ? formatter.format(new Date(slot.end)) : null
    return end ? `${start} → ${end}` : start
  } catch {
    return 'Awaiting assignment'
  }
}

function getSessionId(session) {
  return session?.id || session?._id || ''
}

async function safeJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn('Failed to parse JSON payload', error)
    return null
  }
}

function useSpecialCollectionConfig() {
  const [state, setState] = useState({ loading: true, error: null, items: [], slotConfig: null })

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const response = await fetch('/api/schedules/special/config')
        const payload = await safeJson(response)
        if (cancelled) return

        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || 'Unable to load scheduling configuration')
        }

        setState({
          loading: false,
          error: null,
          items: payload?.items ?? [],
          slotConfig: payload?.slotConfig ?? null,
        })
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, items: [], slotConfig: null })
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

function useResidentRequests(sessionId, onSessionInvalid) {
  const [state, setState] = useState({ loading: false, error: null, requests: [] })

  const load = useCallback(async () => {
    if (!sessionId) {
      setState({ loading: false, error: null, requests: [] })
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(`/api/schedules/special/my?userId=${encodeURIComponent(sessionId)}`)
      const payload = await safeJson(response)

      if (!response.ok || payload?.ok === false) {
        const message = payload?.message || 'Unable to load your scheduled pickups'
        if (response.status === 403 || response.status === 404) {
          onSessionInvalid?.(message)
          return
        }
        throw new Error(message)
      }

      setState({ loading: false, error: null, requests: payload?.requests ?? [] })
    } catch (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message, requests: [] }))
    }
  }, [sessionId, onSessionInvalid])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refresh: load }
}

function RequestForm({
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
                inputProps={{ pattern: "[0-9+\\-()\\s]{7,}" }}
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
              <DatePicker
                label="Set date"
                value={dateValue}
                onChange={handleDateChange}
                disablePast
                format="YYYY-MM-DD"
                slotProps={{
                  textField: {
                    required: true,
                    fullWidth: true,
                    onBlur,
                    name: 'preferredDate',
                    error: Boolean(touched.preferredDate && errors.preferredDate),
                    helperText: touched.preferredDate && errors.preferredDate,
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TimePicker
                label="Set time"
                value={timeValue}
                onChange={handleTimeChange}
                ampm
                minutesStep={15}
                slotProps={{
                  textField: {
                    required: true,
                    fullWidth: true,
                    onBlur,
                    name: 'preferredTime',
                    error: Boolean(touched.preferredTime && errors.preferredTime),
                    helperText: touched.preferredTime && errors.preferredTime,
                  },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Special handling notes"
                name="specialNotes"
                value={form.specialNotes}
                onChange={onChange}
                onBlur={onBlur}
                multiline
                minRows={3}
                fullWidth
              />
            </Grid>
            </Grid>
          </Box>

          {selectedPolicy?.description ? (
            <Alert severity="info" icon={<Info size={18} />}>
              {selectedPolicy.description}
            </Alert>
          ) : null}

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" flexWrap="wrap" spacing={2} alignItems="center">
            <Tooltip title={!isAuthenticated ? 'Please sign in to continue' : (!isFormValid ? 'Please complete required fields' : '')}>
              <span>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!isAuthenticated || availabilityLoading || !isFormValid}
                >
                  {availabilityLoading ? 'Checking…' : 'Check availability'}
                </Button>
              </span>
            </Tooltip>
            {!isAuthenticated && (
              <Button variant="outlined" onClick={onRequireAuth}>
                Sign in to continue
              </Button>
            )}
            <Button variant="text" color="inherit" onClick={onReset} disabled={availabilityLoading}>
              Reset form
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function AvailabilitySection({ availability, loading, onConfirmSlot, bookingInFlight }) {
  const slots = availability?.slots ?? []
  const payment = availability?.payment
  const totalWeightKg = Number(payment?.totalWeightKg ?? 0)
  const weightChargeAmount = Number(payment?.weightCharge ?? 0)
  const taxAmount = Number(payment?.taxCharge ?? 0)

  if (!availability) return null

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <Typography variant="h6" fontWeight={600}>
              Available slots
            </Typography>
          </Stack>

          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : slots.length === 0 ? (
            <Alert severity="warning">
              No slots are available in the requested window. Please try a different time or date.
            </Alert>
          ) : (
            <Grid container spacing={3}>
              {slots.map(slot => (
                <Grid item xs={12} md={6} key={slot.slotId}>
                  <Card className="hover-lift rounded-3xl border border-slate-200/70 shadow-sm">
                    <CardContent>
                      <Stack spacing={2}>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock3 className="h-4 w-4 text-brand-600" />
                          <Typography variant="subtitle2" fontWeight={600}>
                            {formatSlotRange(slot)}
                          </Typography>
                        </div>
                        <Typography variant="body2" color="text.secondary">
                          Capacity remaining: {slot.capacityLeft}
                        </Typography>
                        {payment?.required ? (
                          <Alert severity="info" icon={<Info size={18} />}>
                            Payment required: {formatCurrency(payment.amount)}.
                            {totalWeightKg > 0 ? (
                              <>
                                {' '}
                                Estimated total weight: {totalWeightKg.toFixed(1)} kg.
                              </>
                            ) : null}
                            {weightChargeAmount > 0 ? (
                              <>
                                {' '}
                                Weight surcharge included: {formatCurrency(weightChargeAmount)}.
                              </>
                            ) : null}
                            {taxAmount > 0 ? (
                              <>
                                {' '}
                                Taxes applied: {formatCurrency(taxAmount)}.
                              </>
                            ) : null}
                            {' '}
                            Completing payment will confirm this slot.
                          </Alert>
                        ) : (
                          <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                            No payment required for this request.
                            {totalWeightKg > 0 ? (
                              <>
                                {' '}
                                Estimated total weight: {totalWeightKg.toFixed(1)} kg.
                              </>
                            ) : null}
                          </Alert>
                        )}
                        <Button
                          variant="contained"
                          onClick={() => onConfirmSlot(slot)}
                          disabled={bookingInFlight}
                        >
                          {bookingInFlight ? 'Processing…' : 'Confirm this slot'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, amount, helper, prefix = '' }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        {helper ? (
          <Typography variant="caption" color="text.secondary">
            {helper}
          </Typography>
        ) : null}
      </Stack>
      <Typography variant="body2" fontWeight={600} color="text.primary">
        {prefix}
        {formatCurrency(amount)}
      </Typography>
    </Stack>
  )
}

function PaymentSummary({ payment, showBreakdown = false }) {
  const subtotal = Number(payment?.baseCharge ?? 0)
  const extraCharges = Number(payment?.weightCharge ?? 0)
  const taxCharge = Number(payment?.taxCharge ?? 0)
  const total = Number(payment?.amount ?? 0)

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            Payment details
          </Typography>

          {payment ? (
            <Stack spacing={2}>
              <SummaryRow label="Subtotal" amount={subtotal} />
              <SummaryRow
                label="Extra charges"
                amount={extraCharges}
                prefix="+ "
                helper={showBreakdown ? 'Extra charges are based on Approx. Weight' : undefined}
              />
              <SummaryRow
                label="Tax"
                amount={taxCharge}
                prefix="+ "
                helper={`Municipal levy (${TAX_RATE_PERCENT}%)`}
              />

              <Divider flexItem sx={{ my: 1 }} />

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  Total
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                  {formatCurrency(total)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                (Subtotal + Extra charges + Tax)
              </Typography>
              {!payment.required || total <= 0 ? (
                <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                  No payment required for this request.
                </Alert>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Enter your request details and check availability to see the estimated charges for your pickup.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function ScheduledRequests({ requests, loading, error, allowedItems, onRefresh }) {
  const decorated = useMemo(
    () => requests.map(request => {
      const totalWeight = Number(request.totalWeightKg)
      return {
        id: request._id || request.id,
        itemLabel: allowedItems.find(item => item.id === request.itemType)?.label || request.itemType,
        quantity: request.quantity,
        totalWeightKg: Number.isFinite(totalWeight) ? totalWeight : null,
        createdAt: request.createdAt,
        slot: request.slot,
        status: REQUEST_STATUSES[request.status] || REQUEST_STATUSES.scheduled,
        paymentStatus: PAYMENT_STATUSES[request.paymentStatus] || PAYMENT_STATUSES['not-required'],
      }
    }),
    [requests, allowedItems],
  )

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <MailCheck className="h-5 w-5 text-brand-600" />
              <Typography variant="h6" fontWeight={600}>
                Your scheduled pickups
              </Typography>
            </Stack>
            <IconButton
              aria-label="Refresh scheduled pickups"
              onClick={onRefresh}
              disabled={loading}
              size="small"
            >
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </Stack>
          {error ? (
            <Alert severity="error">{error}</Alert>
          ) : null}
          {loading && !decorated.length ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : decorated.length ? (
            <Stack spacing={2}>
              {decorated.map(request => (
                <Box
                  key={request.id}
                  className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3"
                >
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
                    <div>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {request.itemLabel}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Quantity: {request.quantity}
                      </Typography>
                      {request.totalWeightKg && request.totalWeightKg > 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Estimated total weight: {request.totalWeightKg.toFixed(1)} kg
                        </Typography>
                      ) : null}
                      <Typography variant="body2" color="text.secondary">
                        Requested on {formatRequestTimestamp(request.createdAt)}
                      </Typography>
                    </div>
                    <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                      <Typography variant="body2" color="text.secondary">
                        {formatSlotRange(request.slot)}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip
                          label={request.status.label}
                          color={request.status.color}
                          size="small"
                          variant={request.status.color === 'success' ? 'filled' : 'outlined'}
                        />
                        <Chip
                          label={request.paymentStatus.label}
                          color={request.paymentStatus.color}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              You have not scheduled any special pickups yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function SpecialCollectionPage({ session, onSessionInvalid }) {
  const navigate = useNavigate()
  const sessionId = getSessionId(session)
  const isAuthenticated = Boolean(sessionId || session?.email)

  const sessionDefaults = useMemo(() => ({
    residentName: session?.name ?? '',
    ownerName: session?.householdOwnerName ?? session?.name ?? '',
    address: session?.address ?? '',
    district: session?.district ?? '',
    email: session?.email ?? '',
    phone: session?.phone ?? session?.contactNumber ?? '',
  }), [
    session?.name,
    session?.householdOwnerName,
    session?.address,
    session?.district,
    session?.email,
    session?.phone,
    session?.contactNumber,
  ])

  const { loading: configLoading, error: configError, items } = useSpecialCollectionConfig()
  const allowedItems = useMemo(() => items.filter(item => item.allow), [items])

  const [form, setForm] = useState(() => ({
    ...initialFormState,
    ...sessionDefaults,
  }))
  useEffect(() => {
    setForm(prev => {
      let updated = false
      const next = { ...prev }
      Object.entries(sessionDefaults).forEach(([key, value]) => {
        if (!value) return
        if (!prev[key]) {
          next[key] = value
          updated = true
        }
      })
      return updated ? next : prev
    })
  }, [sessionDefaults])
  useEffect(() => {
    if (!allowedItems.length) return
    setForm(prev => {
      if (prev.itemType) return prev
      return { ...prev, itemType: allowedItems[0].id }
    })
  }, [allowedItems])

  const handleSessionInvalid = useCallback(message => {
    onSessionInvalid?.(message)
    navigate('/login', { replace: true, state: { notice: message } })
  }, [navigate, onSessionInvalid])

  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    refresh: refreshRequests,
  } = useResidentRequests(sessionId, handleSessionInvalid)

  const [availability, setAvailability] = useState(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [bookingInFlight, setBookingInFlight] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [formError, setFormError] = useState(null)
  const [touched, setTouched] = useState({})

  // Basic client-side validation for better UX
  const formErrors = useMemo(() => {
    const errs = {}
    const emailRegex = /.+@.+\..+/
    const qty = Number(form.quantity)
    const weight = Number(form.approxWeight)
    if (!form.residentName?.trim()) errs.residentName = 'Resident name is required'
    if (!form.ownerName?.trim()) errs.ownerName = "Owner's name is required"
    if (!form.email?.trim()) errs.email = 'Email is required'
    else if (!emailRegex.test(form.email)) errs.email = 'Enter a valid email address'
    if (!form.phone?.trim()) errs.phone = 'Phone number is required'
    if (!form.address?.trim()) errs.address = 'Address is required'
    if (!form.district?.trim()) errs.district = 'District is required'
    if (!form.itemType) errs.itemType = 'Item type is required'
    if (!form.preferredDate) errs.preferredDate = 'Date is required'
    if (!form.preferredTime) errs.preferredTime = 'Time is required'
    if (!Number.isFinite(qty) || qty < 1) errs.quantity = 'Quantity must be at least 1'
    if (!Number.isFinite(weight) || weight <= 0) errs.approxWeight = 'Weight must be greater than 0'
    return errs
  }, [form])
  const isFormValid = useMemo(() => Object.keys(formErrors).length === 0, [formErrors])

  const selectedPolicy = useMemo(
    () => allowedItems.find(item => item.id === form.itemType),
    [allowedItems, form.itemType],
  )

  const handleFormChange = useCallback(event => {
    const { name, value } = event.target
    setForm(prev => {
      let nextValue = value
      if (name === 'quantity') {
        nextValue = value === '' ? '' : Number(value)
      } else if (name === 'approxWeight') {
        nextValue = value === '' ? '' : Number(value)
      }
      return {
        ...prev,
        [name]: nextValue,
      }
    })
    setAvailability(null)
    setFormError(null)
  }, [])

  const handleFormBlur = useCallback(event => {
    const { name } = event.target
    setTouched(prev => ({ ...prev, [name]: true }))
  }, [])

  const handleResetForm = useCallback(() => {
    setForm({ ...initialFormState, ...sessionDefaults })
    setTouched({})
    setAvailability(null)
    setFormError(null)
  }, [sessionDefaults])

  const ensureAuthenticated = useCallback(() => {
    navigate('/login')
  }, [navigate])

  const checkAvailability = useCallback(async () => {
    if (!isAuthenticated) {
      ensureAuthenticated()
      return
    }

    const requiredChecks = [
      { field: 'residentName', label: 'resident name', validate: value => Boolean(value?.trim()) },
      { field: 'ownerName', label: "owner's name", validate: value => Boolean(value?.trim()) },
      { field: 'address', label: 'address', validate: value => Boolean(value?.trim()) },
      { field: 'district', label: 'district', validate: value => Boolean(value?.trim()) },
      { field: 'email', label: 'email', validate: value => Boolean(value?.trim()) },
      { field: 'phone', label: 'phone number', validate: value => Boolean(value?.trim()) },
      { field: 'itemType', label: 'item type', validate: value => Boolean(value) },
      { field: 'preferredDate', label: 'date', validate: value => Boolean(value) },
      { field: 'preferredTime', label: 'time', validate: value => Boolean(value) },
      { field: 'quantity', label: 'quantity', validate: value => Number(value) >= 1 },
  { field: 'approxWeight', label: 'approximate weight (kg per item)', validate: value => Number(value) > 0 },
    ]

    const failedCheck = requiredChecks.find(check => !check.validate(form[check.field]))
    if (failedCheck) {
      setTouched(prev => ({ ...prev, [failedCheck.field]: true }))
      setFormError(`Please provide a valid ${failedCheck.label}.`)
      return
    }

    const combinedDateTime = combineDateAndTime(form.preferredDate, form.preferredTime)
    const preferredDateTime = serializeDateTime(combinedDateTime)
    if (!preferredDateTime) {
      setFormError('Please choose both a date and time in the future before checking availability.')
      return
    }

    setAvailability(null)
    setFeedback(null)
    setFormError(null)
    setAvailabilityLoading(true)

    try {
      const response = await fetch('/api/schedules/special/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: sessionId,
          itemType: form.itemType,
          quantity: Number(form.quantity),
          preferredDateTime,
          residentName: form.residentName,
          ownerName: form.ownerName,
          address: form.address,
          district: form.district,
          email: form.email,
          phone: form.phone,
          approxWeight: form.approxWeight === '' ? null : Number(form.approxWeight),
          specialNotes: form.specialNotes,
        }),
      })

      const payload = await safeJson(response)
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || 'Unable to load availability for the selected day.')
      }

      setAvailability(payload)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setAvailabilityLoading(false)
    }
  }, [
    form,
    isAuthenticated,
    ensureAuthenticated,
    sessionId,
  ])

  const submitBooking = useCallback(async (slot, paymentStatus, paymentReference) => {
    setBookingInFlight(true)
    try {
      const combinedDateTime = combineDateAndTime(form.preferredDate, form.preferredTime)
      const preferredDateTime = serializeDateTime(combinedDateTime)
      const payload = {
        userId: sessionId,
        itemType: form.itemType,
        quantity: Number(form.quantity),
        preferredDateTime,
        slotId: slot.slotId,
        residentName: form.residentName,
        ownerName: form.ownerName,
        address: form.address,
        district: form.district,
        email: form.email,
        phone: form.phone,
        approxWeight: form.approxWeight === '' ? null : Number(form.approxWeight),
        specialNotes: form.specialNotes,
      }

      if (paymentStatus) {
        payload.paymentStatus = paymentStatus
      }
      if (paymentReference) {
        payload.paymentReference = paymentReference
      }

      const response = await fetch('/api/schedules/special/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await safeJson(response)
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || 'Unable to schedule the selected slot.')
      }

      setFeedback({ type: 'success', message: result.message })
      setAvailability(null)
      setForm(prev => ({
        ...prev,
        preferredDate: initialFormState.preferredDate,
        preferredTime: initialFormState.preferredTime,
        approxWeight: initialFormState.approxWeight,
        quantity: initialFormState.quantity,
        specialNotes: initialFormState.specialNotes,
      }))
      refreshRequests()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setBookingInFlight(false)
    }
  }, [form, refreshRequests, sessionId])

  const startCheckout = useCallback(async slot => {
    try {
      setBookingInFlight(true)
      const origin = window.location.origin
      const successUrl = `${origin}/schedule/payment/result?status=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}/schedule/payment/result?status=cancelled&session_id={CHECKOUT_SESSION_ID}`
      const combinedDateTime = combineDateAndTime(form.preferredDate, form.preferredTime)
      const preferredDateTime = serializeDateTime(combinedDateTime)

      const request = {
        userId: sessionId,
        itemType: form.itemType,
        quantity: Number(form.quantity),
        preferredDateTime,
        slotId: slot.slotId,
        successUrl,
        cancelUrl,
        residentName: form.residentName,
        ownerName: form.ownerName,
        address: form.address,
        district: form.district,
        email: form.email,
        phone: form.phone,
        approxWeight: form.approxWeight === '' ? null : Number(form.approxWeight),
        specialNotes: form.specialNotes,
      }

      const response = await fetch('/api/schedules/special/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const payload = await safeJson(response)
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.message || 'Unable to start the payment checkout.')
      }

      window.location.href = payload.checkoutUrl
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
      setBookingInFlight(false)
    }
  }, [form, sessionId])

  const handleConfirmSlot = useCallback(slot => {
    if (!availability) return
    if (availability.payment?.required) {
      startCheckout(slot)
    } else {
      submitBooking(slot)
    }
  }, [availability, startCheckout, submitBooking])

  const handleFormSubmit = useCallback(event => {
    event.preventDefault()
    checkAvailability()
  }, [checkAvailability])

  const activeStep = feedback?.type === 'success' ? 2 : availability ? 1 : 0

  return (
    <div className="glass-panel mx-auto max-w-6xl rounded-4xl border border-slate-200/60 bg-white/90 p-8 shadow-md">
      <Stack spacing={5}>
        <Box>
          <Chip
            icon={<Truck size={16} />}
            label="Special pickup scheduling"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600, borderRadius: '999px' }}
          />
          <Typography variant="h4" fontWeight={600} mt={2}>
            Schedule a bulky or speciality pickup
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1.5}>
            Reserve a dedicated collection slot for furniture, e-waste, or other speciality items. Slots are limited each day to ensure crews have sufficient capacity.
          </Typography>
        </Box>

        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <CardContent>
            <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {['Details', 'Availability', 'Confirm'].map(label => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Box>
          </CardContent>
        </Card>

        {feedback ? (
          <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        ) : null}

        {configError ? (
          <Alert severity="error">{configError}</Alert>
        ) : null}

        {formError ? (
          <Alert severity="error" onClose={() => setFormError(null)}>
            {formError}
          </Alert>
        ) : null}

        <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box sx={{ maxWidth: 1100, mx: 'auto', width: '100%' }}>
          <Grid container spacing={3} alignItems="stretch">
            <Grid item xs={12} md={7} sx={{ display: 'flex' }}>
              <RequestForm
                form={form}
                allowedItems={allowedItems}
                selectedPolicy={selectedPolicy}
                onChange={handleFormChange}
                onSubmit={handleFormSubmit}
                availabilityLoading={availabilityLoading || configLoading}
                isAuthenticated={isAuthenticated}
                onRequireAuth={ensureAuthenticated}
                errors={formErrors}
                touched={touched}
                onBlur={handleFormBlur}
                onReset={handleResetForm}
                isFormValid={isFormValid}
              />
            </Grid>
            <Grid item xs={12} md={5} sx={{ display: 'flex' }}>
              <PaymentSummary
                payment={availability?.payment}
                showBreakdown={form.approxWeight !== '' && Number(form.quantity) > 0}
              />
            </Grid>
          </Grid>
        </Box>
        </LocalizationProvider>

        <AvailabilitySection
          availability={availability}
          loading={availabilityLoading}
          onConfirmSlot={handleConfirmSlot}
          bookingInFlight={bookingInFlight}
        />

    <ScheduledRequests
      requests={requests}
      loading={requestsLoading}
      error={requestsError}
      allowedItems={allowedItems}
      onRefresh={refreshRequests}
    />
    </Stack>
  </div>
  )
}
