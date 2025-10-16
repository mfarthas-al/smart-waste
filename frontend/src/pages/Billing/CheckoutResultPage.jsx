import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
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
        setStatus(paymentStatus)
        setReceiptUrl(payload.data?.receiptUrl || null)
        setAmount(payload.data?.amountTotal || null)
        setCurrency(payload.data?.currency || 'lkr')
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
            {amount != null && (
              <Typography variant="body2" color="text.secondary">
                Checkout total: {(amount / 100).toLocaleString('en-LK', { style: 'currency', currency: currency?.toUpperCase?.() || 'LKR' })}
              </Typography>
            )}
            {receiptUrl && status === 'success' && (
              <Button
                variant="outlined"
                component="a"
                href={receiptUrl}
                target="_blank"
                rel="noopener"
              >
                View Stripe receipt
              </Button>
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
