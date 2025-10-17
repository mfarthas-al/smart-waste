import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material'
import { CheckCircle2, Download, RotateCcw, XCircle } from 'lucide-react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'

function ResultStatus({ status }) {
  if (status === 'success') {
    return (
      <Alert severity="success" icon={<CheckCircle2 className="h-5 w-5" />}>
        Payment successful. Your bill has been marked as paid.
      </Alert>
    )
  }
  if (status === 'cancelled') {
    return (
      <Alert severity="warning" icon={<RotateCcw className="h-5 w-5" />}>
        Payment was cancelled. You can retry whenever you are ready.
      </Alert>
    )
  }
  if (status === 'failed') {
    return (
      <Alert severity="error" icon={<XCircle className="h-5 w-5" />}>
        The payment failed. Please verify your card details or choose another payment method.
      </Alert>
    )
  }
  if (status === 'pending') {
    return (
      <Alert severity="info">
        Payment is still pending. Refresh the billing page shortly to confirm the outcome.
      </Alert>
    )
  }
  return null
}

export default function CheckoutResultPage({ session }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [amount, setAmount] = useState(null)
  const [currency, setCurrency] = useState('lkr')
  const [bill, setBill] = useState(null)
  const [transaction, setTransaction] = useState(null)
  const [requestDetails, setRequestDetails] = useState(null)

  useEffect(() => {
    if (!session) {
      setError('Sign in to finish checking out your payment session.')
      setLoading(false)
      return
    }
    if (!sessionId) {
      setError('Missing checkout session identifier.')
      setLoading(false)
      return
    }

    async function syncSession() {
      try {
        setLoading(true)
        const response = await fetch(`/api/billing/checkout/${sessionId}`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.message || 'Unable to sync checkout session')
        }
        const paymentStatus = payload.data?.paymentStatus || 'pending'
        const currencyCode = (payload.data?.currency || payload.data?.bill?.currency || 'lkr').toLowerCase()
        const amountTotal = payload.data?.amountTotal
        setStatus(paymentStatus)
        setReceiptUrl(payload.data?.receiptUrl || payload.data?.transaction?.receiptUrl || null)
        setAmount(typeof amountTotal === 'number' ? amountTotal / 100 : payload.data?.bill?.amount ?? null)
        setCurrency(currencyCode)
        setBill(payload.data?.bill || null)
        setTransaction(payload.data?.transaction || null)
        setRequestDetails(payload.data?.request || null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    syncSession()
  }, [session, sessionId])

  const handleReturn = () => {
    navigate('/billing', { replace: true })
  }

  const formatCurrency = (value, code = 'lkr') => {
    if (value === null || value === undefined) return null
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) return null
    try {
      return numberValue.toLocaleString('en-LK', {
        style: 'currency',
        currency: code?.toUpperCase() || 'LKR',
        minimumFractionDigits: 2,
      })
    } catch (err) {
      console.warn('Failed to format currency', err)
      return `${code?.toUpperCase() || 'LKR'} ${numberValue.toFixed(2)}`
    }
  }

  const formatDate = date => {
    if (!date) return '—'
    try {
      return new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  const formatDateTime = date => {
    if (!date) return '—'
    try {
      return new Date(date).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  const formatSlotWindow = slot => {
    if (!slot?.start) return '—'
    const start = new Date(slot.start)
    const end = slot.end ? new Date(slot.end) : null
    const datePart = start.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const endTime = end ? end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null
    return endTime ? `${datePart} • ${startTime} – ${endTime}` : `${datePart} • ${startTime}`
  }

  const handleDownloadReceipt = () => {
    if (!receiptUrl) return
    window.open(receiptUrl, '_blank', 'noopener,noreferrer')
  }

  const formattedAmount = formatCurrency(amount, currency)
  const invoiceNumber = bill?.invoiceNumber || transaction?.id || transaction?.paymentIntentId
  const scheduledWindow = requestDetails?.slot ? formatSlotWindow(requestDetails.slot) : null

  function DetailRow({ label, value }) {
    if (value === null || value === undefined || value === '') return null
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

  return (
    <div className="mx-auto max-w-3xl px-6">
      <Stack spacing={4} className="glass-panel my-10 rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-md">
        <Typography variant="h4" fontWeight={600}>
          Stripe Checkout summary
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : (
          <Stack spacing={3}>
            <ResultStatus status={status} />
            {status === 'success' && bill ? (
              <Card sx={{ borderRadius: '28px', borderColor: 'rgba(148,163,184,0.35)' }}>
                <CardContent>
                  <Stack spacing={3}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                      <Box sx={{ width: 68, height: 68, borderRadius: '50%', border: theme => `8px solid ${theme.palette.success.main}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={32} color="#047857" />
                      </Box>
                      <Stack spacing={0.5}>
                        <Typography variant="h5" fontWeight={700} color="success.main">
                          Payment confirmed
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          We have updated your bill and scheduled pickup. Save the receipt for your records.
                        </Typography>
                      </Stack>
                    </Stack>

                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <DetailRow label="Invoice number" value={invoiceNumber} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <DetailRow label="Paid on" value={formatDateTime(transaction?.paidAt || bill?.paidAt)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <DetailRow label="Payment method" value={transaction?.paymentMethod ? transaction.paymentMethod.replace(/_/g, ' ').toUpperCase() : null} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <DetailRow label="Amount" value={formattedAmount || formatCurrency(bill.amount, bill.currency)} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <DetailRow label="Due date" value={formatDate(bill.dueDate)} />
                      </Grid>
                    </Grid>

                    {requestDetails ? (
                      <>
                        <Divider textAlign="left">Special collection details</Divider>
                        <Grid container spacing={3}>
                          <Grid item xs={12}>
                            <DetailRow label="Service address" value={requestDetails.address} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="District" value={requestDetails.district} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="Contact" value={requestDetails.contactPhone} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="Item" value={requestDetails.itemLabel || requestDetails.itemType} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="Quantity" value={requestDetails.quantity ? String(requestDetails.quantity) : null} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="Scheduled slot" value={scheduledWindow} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <DetailRow label="Approx. weight" value={requestDetails.totalWeightKg ? `${requestDetails.totalWeightKg.toFixed(1)} kg` : requestDetails.approxWeightKg ? `${requestDetails.approxWeightKg.toFixed(1)} kg` : null} />
                          </Grid>
                        </Grid>
                      </>
                    ) : null}

                    {receiptUrl ? (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <Button variant="contained" startIcon={<Download size={18} />} onClick={handleDownloadReceipt}>
                          Download receipt
                        </Button>
                        <Button variant="text" component="a" href={receiptUrl} target="_blank" rel="noopener">
                          View Stripe receipt
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              amount != null && (
                <Typography variant="body2" color="text.secondary">
                  Checkout total: {formattedAmount || formatCurrency(amount, currency)}
                </Typography>
              )
            )}
          </Stack>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button variant="contained" onClick={handleReturn}>
            Back to My Bills
          </Button>
          <Button component={RouterLink} to="/billing" variant="outlined">
            Billing overview
          </Button>
        </Stack>
      </Stack>
    </div>
  )
}
