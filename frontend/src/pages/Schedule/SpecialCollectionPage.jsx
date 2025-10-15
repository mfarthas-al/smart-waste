import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid, InputLabel, MenuItem, Select, Stack, TextField, Typography,} from '@mui/material'
import { CalendarClock, CheckCircle2, Clock3, Info, MailCheck, Truck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function formatSlotTime(slot) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
    return `${formatter.format(new Date(slot.start))} → ${formatter.format(new Date(slot.end))}`
}

const initialForm = {
    itemType: '',
    quantity: 1,
    preferredDateTime: '',
}

export default function SpecialCollectionPage({ session }) {
    const navigate = useNavigate()
    const [config, setConfig] = useState(null)
    const [form, setForm] = useState(initialForm)
    const [availability, setAvailability] = useState(null)
    const [availabilityLoading, setAvailabilityLoading] = useState(false)
    const [requests, setRequests] = useState([])
    const [feedback, setFeedback] = useState(null)
    const [bookingLoading, setBookingLoading] = useState(false)
    const [error, setError] = useState(null)
    const [paymentDialog, setPaymentDialog] = useState({ open: false, slot: null })

    const isAuthenticated = Boolean(session?.id || session?._id || session?.email)

    useEffect(() => {
        async function loadConfig() {
            try {
                const res = await fetch('/api/schedules/special/config')
                const data = await res.json()
                if (res.ok) {
                    setConfig(data)
                    if (data.items?.length) {
                        setForm(prev => ({
                            ...prev,
                            itemType: prev.itemType || data.items.find(item => item.allow)?.id || '',
                        }))
                    }
                } else {
                    setError(data.message || 'Unable to load configuration.')
                }
            } catch (err) {
                setError(err.message)
            }
        }
        loadConfig()
    }, [])

    useEffect(() => {
        if (!isAuthenticated) return
        async function loadRequests() {
            try {
                const res = await fetch(`/api/schedules/special/my?userId=${session.id || session._id}`)
                const data = await res.json()
                if (res.ok) {
                    setRequests(data.requests || [])
                }
            } catch (err) {
                console.warn('Failed to load existing pickups', err)
            }
        }
        loadRequests()
    }, [isAuthenticated, session])

    useEffect(() => {
        if (!isAuthenticated) {
            setFeedback({ type: 'info', message: 'Sign in to schedule a special pickup.' })
        } else {
            setFeedback(null)
        }
    }, [isAuthenticated])

    const allowedItems = useMemo(() => config?.items?.filter(item => item.allow) ?? [], [config])

    const selectedPolicy = useMemo(
        () => allowedItems.find(item => item.id === form.itemType),
        [allowedItems, form.itemType],
    )

    const handleInputChange = event => {
        const { name, value } = event.target
        setForm(prev => ({
            ...prev,
            [name]: name === 'quantity' ? Number(value) : value,
        }))
        setAvailability(null)
    }

    const handleCheckAvailability = async event => {
        event.preventDefault()
        setError(null)
        setAvailability(null)

        if (!isAuthenticated) {
            navigate('/login')
            return
        }

        setAvailabilityLoading(true)
        try {
            const res = await fetch('/api/schedules/special/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: session.id || session._id,
                    itemType: form.itemType,
                    quantity: Number(form.quantity),
                    preferredDateTime: form.preferredDateTime,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.message || 'Unable to check availability')
            }
            setAvailability(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setAvailabilityLoading(false)
        }
    }

    const submitBooking = async ({ slot, paymentStatus }) => {
        if (!availability) return
        setBookingLoading(true)
        setError(null)

        const paymentReference = availability.payment?.required && paymentStatus === 'success'
            ? `PAY-${Date.now()}`
            : undefined

        const payload = {
            userId: session.id || session._id,
            itemType: form.itemType,
            quantity: Number(form.quantity),
            preferredDateTime: form.preferredDateTime,
            slotId: slot.slotId,
            paymentStatus,
            paymentReference,
        }

        if (!paymentStatus) {
            delete payload.paymentStatus
        }
        if (!paymentReference) {
            delete payload.paymentReference
        }

        try {
            const res = await fetch('/api/schedules/special/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.message || 'Unable to confirm slot')
            }
            setFeedback({ type: 'success', message: data.message })
            setAvailability(null)
            setForm(() => ({ ...initialForm, itemType: form.itemType }))
            setRequests(prev => [data.request, ...prev])
            setPaymentDialog({ open: false, slot: null })
        } catch (err) {
            setError(err.message)
        } finally {
            setBookingLoading(false)
        }
    }

    const handleConfirmSlot = slot => {
        if (!availability) return
        if (availability.payment?.required) {
            setPaymentDialog({ open: true, slot })
        } else {
            submitBooking({ slot })
        }
    }

    const handlePaymentDecision = async outcome => {
        if (outcome === 'success' && paymentDialog.slot) {
            await submitBooking({ slot: paymentDialog.slot, paymentStatus: 'success' })
        } else {
            setPaymentDialog({ open: false, slot: null })
            setFeedback({ type: 'info', message: 'Payment was cancelled. Your slot remains unbooked.' })
        }
    }

    const residentRequests = useMemo(() => requests.map(req => ({
        id: req._id,
        itemType: req.itemType,
        quantity: req.quantity,
        status: req.status,
        slot: req.slot,
        createdAt: req.createdAt,
        paymentStatus: req.paymentStatus,
    })), [requests])

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

                {feedback && (
                    <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
                        {feedback.message}
                    </Alert>
                )}

                {error && (
                    <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}

                <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                    <CardContent>
                        <Stack component="form" spacing={4} onSubmit={handleCheckAvailability}>
                            <Typography variant="h6" fontWeight={600}>
                                Request details
                            </Typography>

                            <Grid container spacing={3}>
                                <Grid item xs={12} md={4}>
                                    <FormControl fullWidth>
                                        <InputLabel id="itemType-label">Item type</InputLabel>
                                        <Select
                                            labelId="itemType-label"
                                            label="Item type"
                                            name="itemType"
                                            value={form.itemType}
                                            onChange={handleInputChange}
                                            required
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
                                        label="Quantity"
                                        name="quantity"
                                        type="number"
                                        value={form.quantity}
                                        onChange={handleInputChange}
                                        inputProps={{ min: 1 }}
                                        required
                                        fullWidth
                                    />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <TextField
                                        label="Preferred date & time"
                                        name="preferredDateTime"
                                        type="datetime-local"
                                        value={form.preferredDateTime}
                                        onChange={handleInputChange}
                                        required
                                        inputProps={{ min: new Date().toISOString().slice(0, 16) }}
                                        fullWidth
                                    />
                                </Grid>
                            </Grid>

                            {selectedPolicy?.description && (
                                <Alert severity="info" icon={<Info size={18} />}>
                                    {selectedPolicy.description}
                                </Alert>
                            )}

                            <Stack direction="row" flexWrap="wrap" spacing={2} alignItems="center">
                                {availabilityLoading ? (
                                    <CircularProgress size={24} />
                                ) : (
                                    <Button type="submit" variant="contained" disabled={!isAuthenticated}>
                                        Check availability
                                    </Button>
                                )}
                                {!isAuthenticated && (
                                    <Button variant="outlined" onClick={() => navigate('/login')}>
                                        Sign in to continue
                                    </Button>
                                )}
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>

                {availability?.slots && (
                    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                        <CardContent>
                            <Stack spacing={3}>
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <CalendarClock className="h-5 w-5 text-brand-600" />
                                    <Typography variant="h6" fontWeight={600}>
                                        Available slots
                                    </Typography>
                                </Stack>
                                {availability.slots.length === 0 ? (
                                    <Alert severity="warning">
                                        No slots are available in the requested window. Please try a different time or date.
                                    </Alert>
                                ) : (
                                    <Grid container spacing={3}>
                                        {availability.slots.map(slot => (
                                            <Grid item xs={12} md={6} key={slot.slotId}>
                                                <Card className="hover-lift rounded-3xl border border-slate-200/70 shadow-sm">
                                                    <CardContent>
                                                        <Stack spacing={2}>
                                                            <div className="flex items-center gap-2 text-slate-600">
                                                                <Clock3 className="h-4 w-4 text-brand-600" />
                                                                <Typography variant="subtitle2" fontWeight={600}>
                                                                    {formatSlotTime(slot)}
                                                                </Typography>
                                                            </div>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Capacity remaining: {slot.capacityLeft}
                                                            </Typography>
                                                            {availability.payment?.required ? (
                                                                <Alert severity="info" icon={<Info size={18} />}>
                                                                    Payment required: LKR {availability.payment.amount.toLocaleString()}. Completing payment will confirm this slot.
                                                                </Alert>
                                                            ) : (
                                                                <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                                                                    No payment required for this request.
                                                                </Alert>
                                                            )}
                                                            <Button
                                                                variant="contained"
                                                                onClick={() => handleConfirmSlot(slot)}
                                                                disabled={bookingLoading}
                                                            >
                                                                {bookingLoading ? 'Confirming…' : 'Confirm this slot'}
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
                )}

                {residentRequests.length > 0 && (
                    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                        <CardContent>
                            <Stack spacing={3}>
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <MailCheck className="h-5 w-5 text-brand-600" />
                                    <Typography variant="h6" fontWeight={600}>
                                        Your scheduled pickups
                                    </Typography>
                                </Stack>
                                <Divider />
                                <Stack spacing={2}>
                                    {residentRequests.map(req => (
                                        <Box
                                            key={req.id}
                                            className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3"
                                        >
                                            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
                                                <div>
                                                    <Typography variant="subtitle1" fontWeight={600}>
                                                        {allowedItems.find(item => item.id === req.itemType)?.label || req.itemType}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Quantity: {req.quantity}
                                                    </Typography>
                                                </div>
                                                <div>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {req.slot ? formatSlotTime(req.slot) : 'Awaiting assignment'}
                                                    </Typography>
                                                    <Stack direction="row" spacing={1} mt={1}>
                                                        <Chip label={req.status} color={req.status === 'scheduled' ? 'success' : 'warning'} size="small" />
                                                        <Chip
                                                            label={req.paymentStatus === 'not-required' ? 'No payment' : req.paymentStatus}
                                                            color={req.paymentStatus === 'success' || req.paymentStatus === 'not-required' ? 'primary' : 'warning'}
                                                            size="small"
                                                            variant="outlined"
                                                        />
                                                    </Stack>
                                                </div>
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>
                )}

                <Dialog
                    open={paymentDialog.open}
                    onClose={() => handlePaymentDecision('cancel')}
                    fullWidth
                    maxWidth="sm"
                >
                    <DialogTitle>Complete payment</DialogTitle>
                    <DialogContent dividers>
                        <Stack spacing={2}>
                            <Typography variant="body1">
                                Pay LKR {availability?.payment?.amount ? availability.payment.amount.toLocaleString() : '0'} to confirm your special pickup slot.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                This simulated payment step represents the secure PaymentUI residents will use during the pilot. Choose “Complete payment” to proceed or “Cancel” to abandon the transaction.
                            </Typography>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => handlePaymentDecision('cancel')} disabled={bookingLoading}>
                            Cancel
                        </Button>
                        <Button variant="contained" onClick={() => handlePaymentDecision('success')} disabled={bookingLoading}>
                            {bookingLoading ? 'Processing…' : 'Complete payment'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>
        </div>
    )
}
