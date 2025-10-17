import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material'
import { Banknote, CreditCard, Download, ExternalLink, Receipt, RefreshCcw, Wallet } from 'lucide-react'

const CURRENCY_FORMATTERS = new Map()
const PAYMENT_METHOD_LABELS = Object.freeze({
  card: 'Card (Visa / Mastercard)',
  link: 'Stripe Link (saved payment)',
})
const MS_PER_DAY = 86_400_000

function getCurrencyFormatter(currency) {
  const key = currency?.toUpperCase() || 'LKR'
  if (!CURRENCY_FORMATTERS.has(key)) {
    CURRENCY_FORMATTERS.set(
      key,
      new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: key,
        minimumFractionDigits: 2,
      }),
    )
  }
  return CURRENCY_FORMATTERS.get(key)
}

function formatCurrency(amount, currency = 'LKR') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '--'
  try {
    return getCurrencyFormatter(currency).format(amount)
  } catch {
    return `LKR ${amount.toFixed(2)}`
  }
}

function computeDueInDays(dueDate) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date()
  const diff = (due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / MS_PER_DAY
  return Math.round(diff)
}

function BillCard({ bill, selectedMethod, onMethodChange, onPay, processing, supportedMethods }) {
  const dueInDays = computeDueInDays(bill.dueDate)
  const overdue = typeof dueInDays === 'number' && dueInDays < 0
  const availableMethods = supportedMethods?.length ? supportedMethods : ['card']

  return (
    <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
      <CardContent>
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={600}>
                {bill.invoiceNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                {bill.description || 'Municipal waste services'}
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                color={overdue ? 'error' : 'warning'}
                label={overdue ? `Overdue by ${Math.abs(dueInDays)} day(s)` : `Due in ${dueInDays ?? '—'} day(s)`}
                size="small"
              />
              <Chip
                color="info"
                variant="outlined"
                size="small"
                label={new Date(bill.dueDate).toLocaleDateString('en-GB')}
              />
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={3}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Amount due
              </Typography>
              <Typography variant="h5" fontWeight={600}>
                {formatCurrency(bill.amount, bill.currency)}
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <FormControl size="small" fullWidth sx={{ minWidth: 180 }}>
                <InputLabel id={`payment-method-${bill._id}`}>Payment method</InputLabel>
                <Select
                  labelId={`payment-method-${bill._id}`}
                  label="Payment method"
                  value={selectedMethod}
                  onChange={event => onMethodChange(bill._id, event.target.value)}
                >
                  {availableMethods.map(method => (
                    <MenuItem key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method] || method}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                onClick={() => onPay(bill)}
                disabled={processing}
                startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <CreditCard size={18} />}
              >
                {processing ? 'Redirecting…' : 'Pay now'}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

BillCard.propTypes = {
  bill: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    invoiceNumber: PropTypes.string.isRequired,
    description: PropTypes.string,
    dueDate: PropTypes.string,
    amount: PropTypes.number.isRequired,
    currency: PropTypes.string,
  }).isRequired,
  selectedMethod: PropTypes.string.isRequired,
  onMethodChange: PropTypes.func.isRequired,
  onPay: PropTypes.func.isRequired,
  processing: PropTypes.bool.isRequired,
  supportedMethods: PropTypes.arrayOf(PropTypes.string),
}

BillCard.defaultProps = {
  supportedMethods: undefined,
}

function PaidBillRow({ bill, onDownloadReceipt }) {
  const transaction = bill.latestTransaction
  const receiptAvailable = Boolean(transaction?.receiptUrl)

  return (
    <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={3}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {bill.invoiceNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Paid on {bill.paidAt ? new Date(bill.paidAt).toLocaleString('en-GB') : 'N/A'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              size="small"
              color="success"
              label={`Paid · ${transaction?.paymentMethod?.toUpperCase() || 'card'}`}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              {formatCurrency(bill.amount, bill.currency)}
            </Typography>
            {receiptAvailable ? (
              <Button
                variant="outlined"
                component="a"
                href={transaction.receiptUrl}
                target="_blank"
                rel="noopener"
                startIcon={<ExternalLink size={16} />}
              >
                View receipt
              </Button>
            ) : (
              <Tooltip title="Download receipt">
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<Download size={16} />}
                    onClick={() => onDownloadReceipt(transaction?._id)}
                    disabled={!transaction?._id}
                  >
                    Download receipt
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

PaidBillRow.propTypes = {
  bill: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    invoiceNumber: PropTypes.string.isRequired,
    paidAt: PropTypes.string,
    amount: PropTypes.number.isRequired,
    currency: PropTypes.string,
    latestTransaction: PropTypes.shape({
      _id: PropTypes.string,
      receiptUrl: PropTypes.string,
      paymentMethod: PropTypes.string,
    }),
  }).isRequired,
  onDownloadReceipt: PropTypes.func.isRequired,
}

export default function BillingPage({ session = null, variant = 'page' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [processingBillId, setProcessingBillId] = useState(null)
  const [selectedMethods, setSelectedMethods] = useState({})
  const [receiptFeedback, setReceiptFeedback] = useState(null)
  const userId = useMemo(() => session?.id || session?._id || null, [session])

  const loadBills = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/billing/bills?userId=${userId}`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message || 'Unable to load billing data')
      }
      setData(payload)
      setProcessingBillId(null)
      setSelectedMethods(prev => {
        const next = { ...prev }
        const supported = payload.supportedPaymentMethods?.length ? payload.supportedPaymentMethods : ['card']
        payload.bills?.outstanding?.forEach(bill => {
          const currentMethod = next[bill._id]
          if (!currentMethod || !supported.includes(currentMethod)) {
            next[bill._id] = supported[0]
          }
        })
        return next
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadBills()
  }, [loadBills])

  const outstandingBills = useMemo(() => data?.bills?.outstanding ?? [], [data])
  const paidBills = useMemo(() => data?.bills?.paid ?? [], [data])
  const summary = useMemo(() => data?.summary ?? null, [data])

  const handleMethodChange = useCallback((billId, value) => {
    setSelectedMethods(prev => ({ ...prev, [billId]: value }))
  }, [])

  const handlePay = useCallback(async bill => {
    if (!userId) return
    setProcessingBillId(bill._id)
    setError(null)
    try {
      const origin = window.location.origin
      const successUrl = `${origin}/billing/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl = `${origin}/billing/checkout?status=cancelled&session_id={CHECKOUT_SESSION_ID}`

      const body = {
        userId,
        billId: bill._id,
        successUrl,
        cancelUrl,
        paymentMethods: [selectedMethods[bill._id] || 'card'],
      }

      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message || 'Unable to start checkout session')
      }

      window.location.href = payload.checkoutUrl
    } catch (err) {
      setError(err.message)
      setProcessingBillId(null)
    }
  }, [selectedMethods, userId])

  const handleDownloadReceipt = useCallback(async transactionId => {
    if (!transactionId) return
    setReceiptFeedback(null)
    try {
      const response = await fetch(`/api/billing/transactions/${transactionId}/receipt?userId=${userId}`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message || 'Unable to fetch receipt')
      }

      const receiptBlob = new Blob([JSON.stringify(payload.receipt, null, 2)], { type: 'application/json' })
      const blobUrl = URL.createObjectURL(receiptBlob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `receipt-${payload.receipt.invoiceNumber || transactionId}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)

      setReceiptFeedback({ type: 'success', message: 'Receipt downloaded.' })
    } catch (err) {
      setReceiptFeedback({ type: 'error', message: err.message })
    }
  }, [userId])

  const emptyState = !loading && outstandingBills.length === 0

  const wrapperClass = variant === 'page' ? 'mx-auto max-w-6xl px-6' : ''
  const panelClass = variant === 'page'
    ? 'glass-panel my-8 rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-md'
    : 'glass-panel rounded-4xl border border-slate-200/70 bg-white/95 p-6 shadow-md'

  return (
    <div className={wrapperClass}>
      <Stack spacing={5} className={panelClass}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
          <Box>
            <Chip
              icon={<Wallet size={16} />}
              label="Resident billing centre"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600, borderRadius: '999px' }}
            />
            <Typography variant="h4" fontWeight={600} mt={2}>
              Manage your municipal waste bills
            </Typography>
            <Typography variant="body1" color="text.secondary" mt={1.5}>
              Review outstanding invoices, launch secure Stripe Checkout, and download payment receipts once settled.
            </Typography>
          </Box>
          <Tooltip title="Refresh billing data">
            <span>
              <IconButton
                onClick={loadBills}
                disabled={loading}
                color="primary"
                size="medium"
                aria-label="Refresh billing data"
              >
                {loading ? <CircularProgress size={20} /> : <RefreshCcw size={18} />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {receiptFeedback && (
          <Alert severity={receiptFeedback.type} onClose={() => setReceiptFeedback(null)}>
            {receiptFeedback.message}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={5}>
            <Card className="rounded-3xl border border-slate-200/80 bg-slate-50/70">
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }} justifyContent="space-between">
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Banknote className="h-8 w-8 text-brand-600" />
                    <div>
                      <Typography variant="subtitle1" fontWeight={600}>
                        Outstanding balance
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {summary?.outstandingCount || 0} invoice(s) pending payment
                      </Typography>
                    </div>
                  </Stack>
                  <Typography variant="h4" fontWeight={600}>
                    {formatCurrency(summary?.outstandingTotal || 0)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {emptyState ? (
              <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                <CardContent>
                  <Stack spacing={2} alignItems="center" textAlign="center">
                    <CreditCard className="h-8 w-8 text-brand-600" />
                    <Typography variant="h6" fontWeight={600}>
                      You are all caught up!
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      There are no outstanding invoices. When new bills are generated, they will appear here for secure payment.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Stack spacing={3}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Outstanding bills
                </Typography>
                <Grid container spacing={3}>
                  {outstandingBills.map(bill => (
                    <Grid item xs={12} key={bill._id}>
                      <BillCard
                        bill={bill}
                        selectedMethod={selectedMethods[bill._id] || 'card'}
                        onMethodChange={handleMethodChange}
                        onPay={handlePay}
                        processing={processingBillId === bill._id}
                        supportedMethods={data?.supportedPaymentMethods}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Stack>
            )}

            <Divider />

            <Stack spacing={3}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Receipt className="h-5 w-5 text-brand-600" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Payment history
                </Typography>
              </Stack>
              {paidBills.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No payments recorded yet. Complete a payment to see your receipt history.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {paidBills.map(bill => (
                    <PaidBillRow key={bill._id} bill={bill} onDownloadReceipt={handleDownloadReceipt} />
                  ))}
                </Stack>
              )}
            </Stack>
          </Stack>
        )}
      </Stack>
    </div>
  )
}

BillingPage.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    role: PropTypes.string,
  }),
  variant: PropTypes.oneOf(['page', 'embedded']),
}
