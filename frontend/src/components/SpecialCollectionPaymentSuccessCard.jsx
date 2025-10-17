import { Box, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material'
import { Check, Download } from 'lucide-react'

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(amount, currency = 'LKR') {
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0)
  }
  try {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch (error) {
    console.warn('Failed to format amount', error)
    return currencyFormatter.format(value)
  }
}

function formatWeight(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `${num.toFixed(1)} kg`
}

export default function SpecialCollectionPaymentSuccessCard({
  request,
  payment = {},
  downloadPending = false,
  onDownloadReceipt,
  stripeReceiptUrl,
  actions = [],
  illustrationSrc,
  illustrationAlt = 'Confirmation Illustration',
}) {
  const totalPaid = payment.total ?? request?.paymentAmount ?? 0
  const subtotal = payment.subtotal ?? request?.paymentSubtotal ?? totalPaid
  const extraCharge = payment.extraCharge ?? request?.paymentWeightCharge ?? 0
  const taxCharge = payment.tax ?? request?.paymentTaxCharge ?? 0
  const currency = request?.currency || request?.paymentCurrency || payment.currency || 'LKR'

  const slotStart = request?.slot?.start ? new Date(request.slot.start) : null
  const scheduledDate = slotStart
    ? slotStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const scheduledTime = slotStart
    ? slotStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const approxWeightDisplay = request?.approxWeightKg ? `${formatWeight(request.approxWeightKg)} per item` : null
  const totalWeightDisplay = request?.totalWeightKg ? formatWeight(request.totalWeightKg) : null

  const handleStripeReceipt = () => {
    if (!stripeReceiptUrl) return
    window.open(stripeReceiptUrl, '_blank', 'noopener,noreferrer')
  }

  const downloadLabel = stripeReceiptUrl ? 'Download PDF' : 'Download'

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-lg" sx={{ overflow: 'hidden', width: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            mb: 2,
          }}
        >
          <Box
            sx={{
              width: { xs: 40, sm: 52 },
              height: { xs: 40, sm: 52 },
              borderRadius: '50%',
              border: '6px solid',
              borderColor: 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'success.50',
            }}
          >
            <Check size={22} color="#097969" strokeWidth={3} />
          </Box>
          <Typography
            variant="h4"
            fontWeight={700}
            color="success.main"
            sx={{
              letterSpacing: '-0.5px',
              fontSize: { xs: '1.4rem', sm: '1.9rem', md: '2.125rem' },
              textAlign: 'center',
            }}
          >
            Payment Successful
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch">
          <Grid item xs={12} lg={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                bgcolor: 'grey.50',
                borderRadius: 2,
                p: 2,
                border: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}
                  >
                    Address
                  </Typography>
                  <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.4 }}>
                    {request?.address || '—'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    District
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.district || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Item Type
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.itemLabel || request?.itemType || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Phone
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.contactPhone || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Email
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.contactEmail || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Weight
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{totalWeightDisplay || approxWeightDisplay || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Quantity
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.quantity || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Time
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{scheduledTime}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Date
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{scheduledDate}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Receipt
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {onDownloadReceipt ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={onDownloadReceipt}
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
                            bgcolor: 'transparent',
                          },
                        }}
                      >
                        {downloadPending ? 'Preparing…' : downloadLabel}
                      </Button>
                    ) : null}
                    {stripeReceiptUrl ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleStripeReceipt}
                        sx={{
                          textDecoration: 'underline',
                          px: 0,
                          justifyContent: 'flex-start',
                          fontWeight: 600,
                          color: 'success.main',
                          '&:hover': {
                            color: 'success.dark',
                            bgcolor: 'transparent',
                          },
                        }}
                      >
                        View Stripe receipt
                      </Button>
                    ) : null}
                  </Stack>
                </Grid>
              </Grid>
            </Box>

            <Box
              sx={{
                bgcolor: 'success.50',
                borderRadius: 2,
                p: 2,
                border: '2px solid',
                borderColor: 'success.main',
              }}
            >
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="h5" fontWeight={700} color="text.secondary">
                  Total:
                </Typography>
                <Typography variant="h4" fontWeight={800} color="success.main">
                  {formatCurrency(totalPaid, currency)}
                </Typography>
              </Stack>
              <Divider sx={{ mb: 1.5, borderColor: 'success.200' }} />
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Subtotal
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(subtotal, currency)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Extra charges
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    +{formatCurrency(extraCharge, currency)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Tax
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    +{formatCurrency(taxCharge, currency)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>

            {actions?.length ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
                {actions.map(action => (
                  <Button
                    key={action.label}
                    variant={action.variant || 'contained'}
                    size={action.size || 'large'}
                    onClick={action.onClick}
                    fullWidth
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      px: 4,
                      py: 1.5,
                      bgcolor:
                        action.variant === 'outlined'
                          ? 'transparent'
                          : action.color
                          ? undefined
                          : 'success.main',
                      color:
                        action.variant === 'outlined'
                          ? 'success.main'
                          : undefined,
                      borderColor:
                        action.variant === 'outlined'
                          ? 'success.main'
                          : undefined,
                      '&:hover': {
                        bgcolor:
                          action.variant === 'outlined'
                            ? 'success.50'
                            : action.color
                            ? undefined
                            : 'success.dark',
                        borderColor:
                          action.variant === 'outlined'
                            ? 'success.dark'
                            : undefined,
                      },
                    }}
                    color={action.color || (action.variant === 'outlined' ? 'success' : undefined)}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            ) : null}
          </Grid>

          <Grid item xs={12} lg={5} sx={{ display: 'flex' }}>
            <Box
              sx={{
                flex: 1,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.50',
                p: 2,
                minHeight: { xs: 300, lg: 'auto' },
              }}
            >
              <img
                src={illustrationSrc}
                alt={illustrationAlt}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.08))',
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}
