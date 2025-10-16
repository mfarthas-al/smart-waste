import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, Typography } from '@mui/material'
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

    const handleDownloadReceipt = () => {
        if (!request) return

        const lines = [
            'Smart Waste LK - Special Collection Receipt',
            '==========================================',
            `Reference: ${request._id || request.id || 'N/A'}`,
            '',
            'Pickup details:',
            `  Address: ${request.address || 'N/A'}`,
            `  District: ${request.district || 'N/A'}`,
            `  Phone: ${request.contactPhone || 'N/A'}`,
            `  Email: ${request.contactEmail || 'N/A'}`,
            `  Item type: ${itemLabel}`,
            `  Quantity: ${request.quantity}`,
            approxWeightDisplay ? `  Approx. weight per item: ${approxWeightDisplay}` : null,
            totalWeightDisplay ? `  Estimated total weight: ${totalWeightDisplay}` : null,
            `  Scheduled date: ${scheduledDate}`,
            `  Scheduled time: ${scheduledTime}`,
            '',
            'Payment breakdown:',
            `  Subtotal: ${formatCurrency(subtotal)}`,
            `  Extra charges: ${formatCurrency(extraCharge)}`,
            `  Tax: ${formatCurrency(taxCharge)}`,
            `  Total paid: ${formatCurrency(totalPaid)}`,
            '',
            'Thank you for using Smart Waste LK.',
        ].filter(line => line !== null && line !== undefined)

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `special-collection-receipt-${request._id || request.id || Date.now()}.txt`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
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
                        <Card className="rounded-4xl border border-slate-200/70 shadow-sm">
                            <CardContent>
                                <Stack spacing={3}>
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                        <Typography variant="h6" fontWeight={600}>
                                            Payment confirmed and pickup scheduled
                                        </Typography>
                                    </Stack>
                                    <Stack spacing={2}>
                                        <Typography variant="body1" color="text.secondary">
                                            Your slot has been secured and a receipt is available below. Keep this for your records.
                                        </Typography>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Clock3 className="h-4 w-4 text-brand-600" />
                                            <Typography variant="body2" color="text.secondary">
                                                {formatSlotTime(request.slot)}
                                            </Typography>
                                        </Stack>
                                    </Stack>

                                    <Divider flexItem />

                                    <Stack spacing={3}>
                                        <Stack spacing={1}>
                                            <Typography variant="subtitle1" fontWeight={700}>
                                                Receipt details
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Smart Waste LK special collection booking receipt for {itemLabel}.
                                            </Typography>
                                        </Stack>

                                        <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
                                            <Stack spacing={1.5} flex={1}>
                                                <Typography variant="subtitle2" color="text.secondary">
                                                    Service information
                                                </Typography>
                                                <DetailRow label="Address" value={request.address} />
                                                <DetailRow label="District" value={request.district} />
                                                <DetailRow label="Phone" value={request.contactPhone} />
                                                <DetailRow label="Email" value={request.contactEmail} />
                                                <DetailRow label="Item type" value={itemLabel} />
                                                <DetailRow label="Quantity" value={request.quantity} />
                                                <DetailRow label="Approx. weight" value={approxWeightDisplay} />
                                                <DetailRow label="Estimated total weight" value={totalWeightDisplay} />
                                                <DetailRow label="Scheduled date" value={scheduledDate} />
                                                <DetailRow label="Scheduled time" value={scheduledTime} />
                                            </Stack>

                                            <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />

                                            <Stack spacing={1.5} flex={1}>
                                                <Typography variant="subtitle2" color="text.secondary">
                                                    Payment breakdown
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="body2" color="text.secondary">
                                                        Payment amount
                                                    </Typography>
                                                    <Typography variant="subtitle1" fontWeight={700}>
                                                        {formatCurrency(totalPaid)}
                                                    </Typography>
                                                </Stack>
                                                <Stack spacing={0.75}>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                                                        <Typography variant="body2" fontWeight={600}>{formatCurrency(subtotal)}</Typography>
                                                    </Stack>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">Extra charges</Typography>
                                                        <Typography variant="body2" fontWeight={600}>{formatCurrency(extraCharge)}</Typography>
                                                    </Stack>
                                                    <Stack direction="row" justifyContent="space-between">
                                                        <Typography variant="body2" color="text.secondary">Tax</Typography>
                                                        <Typography variant="body2" fontWeight={600}>{formatCurrency(taxCharge)}</Typography>
                                                    </Stack>
                                                </Stack>
                                                <Typography variant="caption" color="text.secondary">
                                                    Total = Subtotal + Extra charges + Tax
                                                </Typography>
                                                <Button variant="outlined" startIcon={<Download />} onClick={handleDownloadReceipt} sx={{ alignSelf: 'flex-start' }}>
                                                    Download receipt
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    </Stack>
                                </Stack>
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
