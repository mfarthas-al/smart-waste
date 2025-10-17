import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { RotateCcw, XCircle } from 'lucide-react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import ConfirmationIllustration from '../../assets/Confirmation.png'
import SpecialCollectionPaymentSuccessCard from '../../components/SpecialCollectionPaymentSuccessCard.jsx'

function ResultStatus({ status }) {
  if (status === 'success') {
    return null
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
  const [requestDetails, setRequestDetails] = useState(null)
  const [downloadPending, setDownloadPending] = useState(false)

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

  const goToDashboard = () => {
    if (session?.role === 'admin') {
      navigate('/adminDashboard', { replace: true })
    } else {
      navigate('/userDashboard', { replace: true })
    }
  }

  const handleDownloadReceipt = async () => {
    const request = requestDetails
    if (!request) {
      if (receiptUrl) {
        window.open(receiptUrl, '_blank', 'noopener,noreferrer')
      }
      return
    }

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
    } catch (err) {
      console.error('Receipt download failed', err)
      if (receiptUrl) {
        window.open(receiptUrl, '_blank', 'noopener,noreferrer')
      } else {
        window.alert(err.message || 'Could not download the receipt. Please try again later.')
      }
    } finally {
      setDownloadPending(false)
    }
  }

  const dashboardPath = session?.role === 'admin' ? '/adminDashboard' : '/userDashboard'
  const fallbackCurrency = (requestDetails?.paymentCurrency || requestDetails?.currency || bill?.currency || currency || 'LKR').toUpperCase()

  const mergedRequest = requestDetails
    ? {
        ...requestDetails,
        paymentCurrency: requestDetails.paymentCurrency || requestDetails.currency || fallbackCurrency,
      }
    : null

  const paymentDetails = {
    total: requestDetails?.paymentAmount ?? bill?.amount ?? amount ?? 0,
    subtotal: requestDetails?.paymentSubtotal ?? bill?.amount ?? amount ?? 0,
    extraCharge: requestDetails?.paymentWeightCharge ?? 0,
    tax: requestDetails?.paymentTaxCharge ?? 0,
    currency: fallbackCurrency,
  }

  const isSuccess = status === 'success'

  const successActions = [
    { label: 'Go to Billing', variant: 'contained', onClick: handleReturn },
    { label: 'View Dashboard', variant: 'outlined', onClick: goToDashboard },
  ]

  return (
    <div className="mx-auto flex flex-col gap-4 px-4 py-6 md:px-6 md:py-10" style={{ maxWidth: '1100px' }}>
      {!isSuccess && (
        <Stack spacing={2.5}>
          <Typography variant="h4" fontWeight={600}>
            Bill payment
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review the payment outcome for your outstanding special collection invoice.
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
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {isSuccess ? (
            mergedRequest ? (
              <SpecialCollectionPaymentSuccessCard
                request={mergedRequest}
                payment={paymentDetails}
                onDownloadReceipt={handleDownloadReceipt}
                downloadPending={downloadPending}
                stripeReceiptUrl={receiptUrl}
                illustrationSrc={ConfirmationIllustration}
                actions={successActions}
              />
            ) : (
              <Alert severity="info">
                Payment confirmed, but the linked special collection request could not be found.
              </Alert>
            )
          ) : (
            <ResultStatus status={status} />
          )}

          {!isSuccess && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button variant="contained" onClick={handleReturn}>
                Back to My Bills
              </Button>
              <Button component={RouterLink} to={dashboardPath} variant="outlined">
                View dashboard
              </Button>
            </Stack>
          )}
        </Stack>
      )}
    </div>
  )
}
