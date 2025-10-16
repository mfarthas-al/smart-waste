import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
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
                                    <Stack spacing={1}>
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            {request.itemType || 'Special collection'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Quantity: {request.quantity}
                                        </Typography>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Clock3 className="h-4 w-4 text-brand-600" />
                                            <Typography variant="body2" color="text.secondary">
                                                {formatSlotTime(request.slot)}
                                            </Typography>
                                        </Stack>
                                        {typeof request.totalWeightKg === 'number' && request.totalWeightKg > 0 ? (
                                            <Typography variant="body2" color="text.secondary">
                                                Estimated total weight: {request.totalWeightKg.toFixed(1)} kg
                                            </Typography>
                                        ) : null}
                                        {request.paymentAmount ? (
                                            <Typography variant="body2" color="text.secondary">
                                                Paid amount: LKR {request.paymentAmount.toLocaleString()}
                                            </Typography>
                                        ) : null}
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
