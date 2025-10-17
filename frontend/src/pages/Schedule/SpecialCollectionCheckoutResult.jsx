import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material'
import { Check, CheckCircle2, Clock3, Download, XCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmationIllustration from '../../assets/Confirmation.png'

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
        <div className="mx-auto flex flex-col gap-4 px-4 py-6 md:px-6 md:py-10" style={{ maxWidth: '1100px' }}>
            {!isSuccess && (
                <Stack spacing={2.5}>
                    <Typography variant="h4" fontWeight={600}>
                        Special pickup payment
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        We use the payment outcome to confirm or release your reserved slot. You can return to the schedule page at any time to pick a different window.
                    </Typography>
                </Stack>
            )}

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
                        <Card className="rounded-3xl border border-slate-200/70 shadow-lg" sx={{ overflow: 'hidden', width: '100%' }}>
                            <CardContent sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 } }}>
                                {/* Centered header: icon + title */}
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 1.5,
                                    mb: 2
                                }}>
                                    <Box sx={{
                                        width: { xs: 40, sm: 52 },
                                        height: { xs: 40, sm: 52 },
                                        borderRadius: '50%',
                                        border: '6px solid',
                                        borderColor: 'success.main',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: 'success.50'
                                    }}>
                                        <Check size={22} color="#097969" strokeWidth={3} />
                                    </Box>
                                    <Typography
                                        variant="h4"
                                        fontWeight={700}
                                        color="success.main"
                                        sx={{
                                            letterSpacing: '-0.5px',
                                            fontSize: { xs: '1.4rem', sm: '1.9rem', md: '2.125rem' },
                                            textAlign: 'center'
                                        }}
                                    >
                                        Payment Successful
                                    </Typography>
                                </Box>

                                <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch">
                                    <Grid item xs={12} lg={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                                        <Box sx={{ 
                                            bgcolor: 'grey.50', 
                                            borderRadius: 2, 
                                            p: 2,
                                            border: '1px solid',
                                            borderColor: 'grey.200'
                                        }}>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Address</Typography>
                                                    <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.4 }}>{request.address || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>District</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{request.district || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Item Type</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{itemLabel}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Phone</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{request.contactPhone || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Email</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{request.contactEmail || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={4}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Weight</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{totalWeightDisplay || approxWeightDisplay || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={4}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Quantity</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{request.quantity || '—'}</Typography>
                                                </Grid>
                                                <Grid item xs={4}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Time</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{scheduledTime}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Date</Typography>
                                                    <Typography variant="h6" fontWeight={600}>{scheduledDate}</Typography>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>Receipt</Typography>
                                                    <Button 
                                                        size="small" 
                                                        variant="text" 
                                                        onClick={handleDownloadReceipt} 
                                                        disabled={downloadPending}
                                                        startIcon={<Download size={16} />}
                                                        sx={{ 
                                                            textDecoration: 'underline', 
                                                            px: 0, 
                                                            justifyContent: 'flex-start',
                                                            fontWeight: 600,
                                                            color: 'success.main',
                                                            '&:hover': {
                                                                color: 'success.dark',
                                                                bgcolor: 'transparent'
                                                            }
                                                        }}
                                                    >
                                                        {downloadPending ? 'Preparing…' : 'Download PDF'}
                                                    </Button>
                                                </Grid>
                                            </Grid>
                                        </Box>

                                        <Box sx={{ 
                                            bgcolor: 'success.50', 
                                            borderRadius: 2, 
                                            p: 2,
                                            border: '2px solid',
                                            borderColor: 'success.main'
                                        }}>
                                            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                                                <Typography variant="h5" fontWeight={700} color="text.secondary">Total:</Typography>
                                                <Typography variant="h4" fontWeight={800} color="success.main">{formatCurrency(totalPaid)}</Typography>
                                            </Stack>
                                            <Divider sx={{ mb: 1.5, borderColor: 'success.200' }} />
                                            <Stack spacing={0.75}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="body2" fontWeight={600} color="text.secondary">Subtotal</Typography>
                                                    <Typography variant="body2" fontWeight={600}>{formatCurrency(subtotal)}</Typography>
                                                </Stack>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="body2" fontWeight={600} color="text.secondary">Extra charges</Typography>
                                                    <Typography variant="body2" fontWeight={600} color="success.main">+{formatCurrency(extraCharge)}</Typography>
                                                </Stack>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="body2" fontWeight={600} color="text.secondary">Tax</Typography>
                                                    <Typography variant="body2" fontWeight={600} color="success.main">+{formatCurrency(taxCharge)}</Typography>
                                                </Stack>
                                            </Stack>
                                        </Box>

                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
                                            <Button 
                                                variant="contained" 
                                                size="large"
                                                onClick={goToDashboard}
                                                fullWidth
                                                sx={{ 
                                                    borderRadius: 2,
                                                    textTransform: 'none',
                                                    px: 4,
                                                    py: 1.5,
                                                    bgcolor: 'success.main',
                                                    '&:hover': {
                                                        bgcolor: 'success.dark',
                                                    }
                                                }}
                                            >
                                                Go to Dashboard
                                            </Button>
                                            <Button 
                                                variant="outlined" 
                                                size="large"
                                                onClick={goToSchedule}
                                                fullWidth
                                                sx={{ 
                                                    borderRadius: 2,
                                                    textTransform: 'none',
                                                    px: 4,
                                                    py: 1.5,
                                                    borderColor: 'success.main',
                                                    color: 'success.main',
                                                    '&:hover': {
                                                        borderColor: 'success.dark',
                                                        bgcolor: 'success.50',
                                                    }
                                                }}
                                            >
                                                Schedule Another Pickup
                                            </Button>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={12} lg={5} sx={{ display: 'flex' }}>
                                        <Box sx={{ 
                                            flex: 1,
                                            borderRadius: 3, 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            bgcolor: 'grey.50',
                                            p: 2,
                                            minHeight: { xs: 300, lg: 'auto' }
                                        }}>
                                            <img 
                                                src={ConfirmationIllustration} 
                                                alt="Confirmation Illustration" 
                                                style={{ 
                                                    maxWidth: '100%', 
                                                    maxHeight: '100%', 
                                                    objectFit: 'contain',
                                                    filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.08))'
                                                }}
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

                    
                </Stack>
            )}
        </div>
    )
}
