import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material'
import { CheckCircle2, Clock3, Download, XCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

function formatSlotTime(slot) {
    if (!slot) return '—'
    const formatter = new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
    try {
        return `${formatter.format(new Date(slot.start))} → ${formatter.format(new Date(slot.end))}`
    } catch {
        return '—'
    }
}

function formatWeight(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) return null
    return `${num.toFixed(1)} kg`
}

const currencyFormatter = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

function formatCurrency(amount) {
    const value = Number(amount)
    if (!Number.isFinite(value)) {
        return currencyFormatter.format(0)
    }
    return currencyFormatter.format(value)
}

function DetailRow({ label, value }) {
    if (value === null || value === undefined || value === '') {
        return null
    }
    return (
        <Stack spacing={0.25}>
            <Typography variant="caption" color="text.secondary">
                {label}
            </Typography>
            <Typography variant="body2" fontWeight={600} color="text.primary">
                {value}
            </Typography>
        </Stack>
    )
}

export default function SpecialCollectionCheckoutResult({ session }) {
    const location = useLocation()
    const navigate = useNavigate()
    const search = useMemo(() => new URLSearchParams(location.search), [location.search])
    const redirectStatus = search.get('status') || undefined
    const sessionId = search.get('session_id')

    const [state, setState] = useState({ loading: true, error: null, request: null, paymentStatus: redirectStatus || 'pending' })
    const [downloadPending, setDownloadPending] = useState(false)

    useEffect(() => {
        if (!sessionId) {
            setState({ loading: false, error: 'Missing checkout session. Please try scheduling again.', request: null, paymentStatus: 'failed' })
            return
        }

        let ignore = false

        async function syncCheckout() {
            try {
                const statusQuery = redirectStatus ? `?status=${redirectStatus}` : ''
                const response = await fetch(`/api/schedules/special/payment/checkout/${sessionId}${statusQuery}`)
                let payload = null
                try {
                    payload = await response.json()
                } catch {
                    payload = null
                }

                if (ignore) return

                if (!response.ok) {
                    setState({
                        loading: false,
                        error: payload?.message || 'Payment was not completed. Please start again.',
                        request: null,
                        paymentStatus: 'failed',
                    })
                    return
                }

                setState({
                    loading: false,
                    error: null,
                    request: payload?.request || null,
                    paymentStatus: payload?.status || 'success',
                })
            } catch (error) {
                if (ignore) return
                setState({
                    loading: false,
                    error: error.message || 'We could not verify the payment outcome. Please try again.',
                    request: null,
                    paymentStatus: 'failed',
                })
            }
        }

        syncCheckout()

        return () => {
            ignore = true
        }
    }, [redirectStatus, sessionId])

    const goToSchedule = () => {
        navigate('/schedule', { replace: true })
    }

    const goToDashboard = () => {
        if (session?.role === 'admin') {
            navigate('/adminDashboard', { replace: true })
        } else {
            navigate('/userDashboard', { replace: true })
        }
    }

    const { loading, error, request, paymentStatus } = state
    const isSuccess = paymentStatus === 'success' && request
    const slotStart = request?.slot?.start ? new Date(request.slot.start) : null
    const scheduledDate = slotStart
        ? slotStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—'
    const scheduledTime = slotStart
        ? slotStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '—'
    const itemLabel = request?.itemLabel || request?.itemType || 'Special collection'
    const subtotal = request?.paymentSubtotal ?? request?.paymentAmount ?? 0
    const extraCharge = request?.paymentWeightCharge ?? 0
    const taxCharge = request?.paymentTaxCharge ?? 0
    const totalPaid = request?.paymentAmount ?? 0
    const approxWeightDisplay = request?.approxWeightKg ? `${formatWeight(request.approxWeightKg)} per item` : null
    const totalWeightDisplay = request?.totalWeightKg ? formatWeight(request.totalWeightKg) : null

    const handleDownloadReceipt = async () => {
        if (!request) return

        const requestId = request._id || request.id
        const userId = session?.id || session?._id || request.userId

        if (!requestId || !userId) {
            window.alert('We could not verify your session. Please sign in again to download the receipt.')
            return
        }

        try {
            setDownloadPending(true)
            const response = await fetch(`/api/schedules/special/requests/${requestId}/receipt?userId=${encodeURIComponent(userId)}`, {
                headers: {
                    Accept: 'application/pdf',
                },
            })

            if (!response.ok) {
                let message = 'Could not download the receipt. Please try again.'
                try {
                    const payload = await response.json()
                    if (payload?.message) {
                        message = payload.message
                    }
                } catch (parseError) {
                    console.warn('Failed to parse receipt error payload', parseError)
                }
                throw new Error(message)
            }

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `special-collection-receipt-${requestId}.pdf`
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Receipt download failed', error)
            window.alert(error.message || 'Could not download the receipt. Please try again later.')
        } finally {
            setDownloadPending(false)
        }
    }

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
            <Stack spacing={3}>
                <Typography variant="h4" fontWeight={600}>
                    Special pickup payment
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    We use the payment outcome to confirm or release your reserved slot. You can return to the schedule page at any time to pick a different window.
                </Typography>
            </Stack>

            {loading ? (
                <Box display="flex" justifyContent="center" py={8}>
                    <CircularProgress />
                </Box>
            ) : (
                <Stack spacing={4}>
                    {error && (
                        <Alert severity="error">{error}</Alert>
                    )}

                    {isSuccess ? (
                        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                            <CardContent>
                                <Grid container spacing={3} alignItems="stretch">
                                    <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Box sx={{ width: 70, height: 70, borderRadius: '50%', border: '8px solid', borderColor: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <CheckCircle2 size={32} color="#097969" />
                                            </Box>
                                            <Typography variant="h4" fontWeight={700} color="success.main">
                                                Payment Successful
                                            </Typography>
                                        </Stack>

                                        <Grid container spacing={2} sx={{ mt: 1 }}>
                                            <Grid item xs={12}>
                                                <Typography variant="subtitle2" color="text.secondary">Address:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{request.address || '—'}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="subtitle2" color="text.secondary">District:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{request.district || '—'}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="subtitle2" color="text.secondary">Item type:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{itemLabel}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="subtitle2" color="text.secondary">Phone:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{request.contactPhone || '—'}</Typography>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Typography variant="subtitle2" color="text.secondary">Email</Typography>
                                                <Typography variant="h6" fontWeight={600}>{request.contactEmail || '—'}</Typography>
                                            </Grid>
                                            <Grid item xs={4}>
                                                <Typography variant="subtitle2" color="text.secondary">Approx. weight:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{totalWeightDisplay || approxWeightDisplay || '—'}</Typography>
                                            </Grid>
                                            <Grid item xs={4}>
                                                <Typography variant="subtitle2" color="text.secondary">Quantity:</Typography>
                                                <Typography variant="h6" fontWeight={600}>{request.quantity || '—'}</Typography>
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
                                                <Typography variant="subtitle2" color="text.secondary">Receipt:</Typography>
                                                <Button 
                                                    size="small" 
                                                    variant="text" 
                                                    onClick={handleDownloadReceipt} 
                                                    disabled={downloadPending}
                                                    sx={{ textDecoration: 'underline', px: 0, justifyContent: 'flex-start' }}
                                                >
                                                    {downloadPending ? 'Preparing…' : 'Download'}
                                                </Button>
                                            </Grid>
                                        </Grid>

                                        <Box sx={{ mt: 2 }}>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Typography variant="h5" fontWeight={700}>Total:</Typography>
                                                <Typography variant="h4" fontWeight={700}>{formatCurrency(totalPaid)}</Typography>
                                            </Stack>
                                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography fontWeight={600}>Subtotal:</Typography>
                                                    <Typography color="text.secondary">{formatCurrency(subtotal)}</Typography>
                                                </Stack>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography fontWeight={600}>Extra charges:</Typography>
                                                    <Typography color="text.secondary">+{formatCurrency(extraCharge)}</Typography>
                                                </Stack>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography fontWeight={600}>Tax:</Typography>
                                                    <Typography color="text.secondary">+{formatCurrency(taxCharge)}</Typography>
                                                </Stack>
                                            </Stack>
                                        </Box>

                                        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                                            <Button variant="outlined" onClick={goToDashboard}>Back</Button>
                                            <Button variant="contained" color="success" onClick={goToSchedule}>Edit Details</Button>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={12} md={5}>
                                        <Box sx={{ width: '100%', height: '100%', minHeight: 360, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <img 
                                                src="/assets/Confirmation Illustration.png" 
                                                alt="Confirmation Illustration" 
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            />
                                        </Box>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>
                    ) : null}

                    {!loading && !isSuccess && !error ? (
                        <Alert severity="info">
                            We have recorded your visit. If you completed payment, refresh this page in a few seconds.
                        </Alert>
                    ) : null}

                    {paymentStatus === 'failed' && !loading ? (
                        <Card className="rounded-4xl border border-slate-200/70 shadow-sm">
                            <CardContent>
                                <Stack spacing={2}>
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <XCircle className="h-5 w-5 text-red-500" />
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            Payment not completed
                                        </Typography>
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        No charges were applied and your slot was released. You can try again with a different time window.
                                    </Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    ) : null}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Button variant="contained" onClick={goToSchedule}>
                            Back to scheduling
                        </Button>
                        <Button variant="outlined" onClick={goToDashboard}>
                            Go to dashboard
                        </Button>
                    </Stack>
                </Stack>
            )}
        </div>
    )
}
