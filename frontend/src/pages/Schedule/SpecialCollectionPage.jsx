import { CheckCircle2, Clock3, Info, Truck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { useNavigate } from 'react-router-dom'
import ConfirmationIllustration from '../../assets/Confirmation.png'
import { INITIAL_FORM_STATE } from './constants.js'
import { AvailabilitySection } from './components/AvailabilitySection.jsx'
import { PaymentSummary } from './components/PaymentSummary.jsx'
import { RequestForm } from './components/RequestForm.jsx'
import { ScheduledRequests } from './components/ScheduledRequests.jsx'
import { useResidentRequests } from './hooks/useResidentRequests.js'
import { useSpecialCollectionConfig } from './hooks/useSpecialCollectionConfig.js'
import {
  combineDateAndTime,
  formatCurrency,
  formatSlotRange,
  getSessionId,
  safeJson,
  serializeDateTime,
} from './utils.js'

function ConfirmationPanel({ details, onBack, onEdit, allowedItems }) {
  if (!details) return null

  const itemLabel = allowedItems.find(i => i.id === details.request.itemType)?.label || details.request.itemType

  const scheduledDate = details.scheduled?.date ? dayjs(details.scheduled.date).format('DD/MM/YYYY') : '—'
  const scheduledTime = details.scheduled?.time ? dayjs(`1970-01-01T${details.scheduled.time}`).format('hh:mm A') : '—'

  const qty = Number(details.request.quantity || 0)
  const perItem = Number(details.request.approxWeight || 0)
  const totalApproxWeight = Number.isFinite(qty * perItem) ? qty * perItem : null

  const subtotal = Number(details.payment?.baseCharge ?? 0)
  const extra = Number(details.payment?.weightCharge ?? 0)
  const tax = Number(details.payment?.taxCharge ?? 0)
  const total = Number(details.payment?.amount ?? 0)

  const paymentStatus = details.request.paymentStatus || (total > 0 ? 'success' : 'not-required')
  const isPaymentPending = paymentStatus === 'pending'
  const isPaymentSuccessful = paymentStatus === 'success'
  const isPaymentNotRequired = paymentStatus === 'not-required'
  const statusColor = isPaymentPending ? 'warning.main' : 'success.main'
  const statusBgColor = isPaymentPending ? 'warning.light' : 'success.light'
  const headingText = isPaymentPending
    ? 'Payment Pending'
    : isPaymentNotRequired
      ? 'Request Confirmed'
      : 'Payment Successful'
  const headingIcon = isPaymentPending
    ? <Clock3 size={32} color="#ea580c" />
    : <CheckCircle2 size={32} color="#097969" />
  const paymentDueMessage = details.request.paymentDueAt
    ? dayjs(details.request.paymentDueAt).format('DD MMM YYYY, hh:mm A')
    : details.scheduled?.slotStart
      ? dayjs(details.scheduled.slotStart).format('DD MMM YYYY, hh:mm A')
      : null

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Centered header: icon + title (mirrors checkout result) */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: { xs: 1.5, sm: 2 },
                mb: 1,
                flexDirection: { xs: 'column', sm: 'row' },
                textAlign: 'center',
              }}
            >
              <Box
                sx={{
                  width: { xs: 48, sm: 64 },
                  height: { xs: 48, sm: 64 },
                  borderRadius: '50%',
                  border: '8px solid',
                  borderColor: statusColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: statusBgColor,
                }}
              >
                {headingIcon}
              </Box>
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{
                  color: statusColor,
                  letterSpacing: '-0.5px',
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.25rem' },
                }}
              >
                {headingText}
              </Typography>
            </Box>

            {isPaymentPending ? (
              <Alert severity="warning" icon={<Clock3 size={18} />}>
                This booking is reserved, but payment is still outstanding.{' '}
                {paymentDueMessage
                  ? `Please settle the bill before ${paymentDueMessage} to avoid automatic cancellation.`
                  : 'Please complete your payment before the scheduled slot to avoid automatic cancellation.'}
              </Alert>
            ) : null}

            {isPaymentSuccessful ? (
              <Typography variant="body2" color="text.secondary">
                Your payment has been received. A confirmation email and receipt will be sent shortly.
              </Typography>
            ) : null}

            {isPaymentNotRequired ? (
              <Typography variant="body2" color="text.secondary">
                No payment was required for this pickup. Your booking is confirmed.
              </Typography>
            ) : null}

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">Address:</Typography>
                <Typography variant="h6" fontWeight={600}>{details.request.address || '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">District:</Typography>
                <Typography variant="h6" fontWeight={600}>{details.request.district || '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">Item type:</Typography>
                <Typography variant="h6" fontWeight={600}>{itemLabel}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">Phone:</Typography>
                <Typography variant="h6" fontWeight={600}>{details.request.phone || '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">Email</Typography>
                <Typography variant="h6" fontWeight={600}>{details.request.email || '—'}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="subtitle2" color="text.secondary">Approx. weight:</Typography>
                <Typography variant="h6" fontWeight={600}>{totalApproxWeight ? `${totalApproxWeight.toFixed(0)}kg` : (perItem ? `${perItem}kg` : '—')}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="subtitle2" color="text.secondary">Quantity:</Typography>
                <Typography variant="h6" fontWeight={600}>{qty || '—'}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="subtitle2" color="text.secondary">Scheduled Time:</Typography>
                <Typography variant="h6" fontWeight={600}>{scheduledTime}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary">Scheduled Date:</Typography>
                <Typography variant="h6" fontWeight={600}>{scheduledDate}</Typography>
              </Grid>
              <Grid item xs={6}>
                {details.payment?.required ? (
                  <>
                    <Typography variant="subtitle2" color="text.secondary">Receipt:</Typography>
                    <Button size="small" variant="text" onClick={() => window.print()} sx={{ textDecoration: 'underline', px: 0 }}>Download</Button>
                  </>
                ) : null}
              </Grid>
            </Grid>

            <Box sx={{ mt: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" fontWeight={700}>Total</Typography>
                <Typography variant="h4" fontWeight={700}>{formatCurrency(total)}</Typography>
              </Stack>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight={600}>Subtotal:</Typography>
                  <Typography color="text.secondary">{formatCurrency(subtotal)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight={600}>Extra charges:</Typography>
                  <Typography color="text.secondary">+{formatCurrency(extra)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography fontWeight={600}>Tax:</Typography>
                  <Typography color="text.secondary">+{formatCurrency(tax)}</Typography>
                </Stack>
              </Stack>
            </Box>

            
          </Grid>
          <Grid item xs={12} md={5} sx={{ display: 'flex' }}>
            <Box sx={{ flex: 1, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 2, minHeight: { xs: 300, md: 'auto' } }}>
              <img 
                src={ConfirmationIllustration} 
                alt="Confirmation Illustration" 
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </Box>
          </Grid>
        </Grid>

        {(onEdit || onBack) ? (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            justifyContent="flex-end"
            sx={{ mt: 2 }}
          >
            {onEdit ? (
              <Button variant="outlined" onClick={onEdit}>
                Schedule another pickup
              </Button>
            ) : null}
            {onBack ? (
              <Button variant="text" onClick={onBack}>
                Back to previous page
              </Button>
            ) : null}
          </Stack>
        ) : null}
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

  const { loading: configLoading, error: configError, items, slotConfig } = useSpecialCollectionConfig()
  const allowedItems = useMemo(() => items.filter(item => item.allow), [items])

  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM_STATE,
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
  const [paymentChoiceOpen, setPaymentChoiceOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
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
  setForm({ ...INITIAL_FORM_STATE, ...sessionDefaults })
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

  const submitBooking = useCallback(async (slot, options = {}) => {
    const { paymentStatus, paymentReference, deferPayment } = options
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
      if (deferPayment) {
        payload.deferPayment = true
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

      const requestDoc = result?.request || {}

      // Capture confirmation snapshot before clearing state
      setConfirmation({
        request: {
          residentName: form.residentName,
          ownerName: form.ownerName,
          address: form.address,
          district: form.district,
          email: form.email,
          phone: form.phone,
          itemType: form.itemType,
          quantity: form.quantity,
          approxWeight: form.approxWeight,
          specialNotes: form.specialNotes,
          status: requestDoc.status,
          paymentStatus: requestDoc.paymentStatus,
          paymentReference: requestDoc.paymentReference,
          paymentDueAt: requestDoc.paymentDueAt,
          paymentRequired: requestDoc.paymentRequired,
          billingId: requestDoc.billingId,
        },
        scheduled: {
          date: form.preferredDate,
          time: form.preferredTime,
          slotId: slot.slotId,
          slotStart: requestDoc.slot?.start || slot.start,
          slotEnd: requestDoc.slot?.end || slot.end,
        },
        payment: availability?.payment || null,
      })
      setFeedback({ type: 'success', message: result.message })
      setAvailability(null)
      setForm(prev => ({
        ...prev,
        preferredDate: INITIAL_FORM_STATE.preferredDate,
        preferredTime: INITIAL_FORM_STATE.preferredTime,
        approxWeight: INITIAL_FORM_STATE.approxWeight,
        quantity: INITIAL_FORM_STATE.quantity,
        specialNotes: INITIAL_FORM_STATE.specialNotes,
      }))
      refreshRequests()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setBookingInFlight(false)
    }
  }, [availability, form, refreshRequests, sessionId])

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

  const closePaymentChoice = useCallback(() => {
    setPaymentChoiceOpen(false)
    setSelectedSlot(null)
  }, [])

  const handleProceedWithPayment = useCallback(() => {
    if (!selectedSlot) return
    const slot = selectedSlot
    closePaymentChoice()
    startCheckout(slot)
  }, [selectedSlot, closePaymentChoice, startCheckout])

  const handleDeferPayment = useCallback(() => {
    if (!selectedSlot) return
    const slot = selectedSlot
    closePaymentChoice()
    submitBooking(slot, { deferPayment: true })
  }, [selectedSlot, closePaymentChoice, submitBooking])

  const handleConfirmSlot = useCallback(slot => {
    if (!availability || bookingInFlight) return
    if (availability.payment?.required) {
      setSelectedSlot(slot)
      setPaymentChoiceOpen(true)
    } else {
      setSelectedSlot(null)
      submitBooking(slot)
    }
  }, [availability, bookingInFlight, submitBooking])

  const handleFormSubmit = useCallback(event => {
    event.preventDefault()
    checkAvailability()
  }, [checkAvailability])

  const activeStep = feedback?.type === 'success' ? 2 : availability ? 1 : 0
  const slotWindowLabel = selectedSlot ? formatSlotRange(selectedSlot) : null
  const slotDueLabel = useMemo(() => {
    if (!selectedSlot?.start) return null
    try {
      return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(selectedSlot.start))
    } catch (error) {
      console.warn('Failed to format slot due date', error)
      return null
    }
  }, [selectedSlot])
  const paymentAmountLabel = availability?.payment?.amount != null
    ? formatCurrency(availability.payment.amount)
    : null

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

        {feedback?.type === 'success' && confirmation ? (
          <Box sx={{ maxWidth: 1100, mx: 'auto', width: '100%' }}>
            <ConfirmationPanel
              details={confirmation}
              allowedItems={allowedItems}
              onBack={() => navigate(-1)}
              onEdit={() => setFeedback(null)}
            />
          </Box>
        ) : (
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
                    slotConfig={slotConfig}
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
        )}

        {feedback?.type === 'success' ? null : (
          <AvailabilitySection
            availability={availability}
            loading={availabilityLoading}
            onConfirmSlot={handleConfirmSlot}
            bookingInFlight={bookingInFlight}
          />
        )}

        <ScheduledRequests
          requests={requests}
          loading={requestsLoading}
          error={requestsError}
          allowedItems={allowedItems}
          onRefresh={refreshRequests}
        />

        <Dialog
          open={paymentChoiceOpen}
          onClose={bookingInFlight ? undefined : closePaymentChoice}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Select how you would like to pay</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Paying now will confirm this pickup immediately.
              {paymentAmountLabel ? ` The total payable amount is ${paymentAmountLabel}.` : ''}
            </DialogContentText>
            <Stack spacing={1.5}>
              {slotWindowLabel ? (
                <Typography variant="body2" color="text.secondary">
                  Slot reserved: {slotWindowLabel}
                </Typography>
              ) : null}
              {slotDueLabel ? (
                <Alert severity="warning" icon={<Clock3 size={18} />}>
                  If payment is not completed before {slotDueLabel}, this reservation will be cancelled automatically.
                </Alert>
              ) : (
                <Alert severity="warning" icon={<Clock3 size={18} />}>
                  This reservation will be cancelled automatically if payment is not completed before the scheduled slot.
                </Alert>
              )}
              <Alert severity="info" icon={<Info size={18} />}>
                Choosing “Pay later” will generate an outstanding bill that you can settle from the My Bills section.
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closePaymentChoice} disabled={bookingInFlight}>
              Back
            </Button>
            <Button onClick={handleDeferPayment} disabled={bookingInFlight} variant="outlined">
              Pay later
            </Button>
            <Button onClick={handleProceedWithPayment} disabled={bookingInFlight} variant="contained">
              Pay now
            </Button>
          </DialogActions>
        </Dialog>
    </Stack>
  </div>
  )
}
