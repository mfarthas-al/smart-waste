import { Alert, Card, CardContent, Divider, Stack, Typography } from '@mui/material'
import { CheckCircle2 } from 'lucide-react'
import { TAX_RATE_PERCENT } from '../constants.js'
import { formatCurrency } from '../utils.js'

function SummaryRow({ label, amount, helper, prefix = '' }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        {helper ? (
          <Typography variant="caption" color="text.secondary">
            {helper}
          </Typography>
        ) : null}
      </Stack>
      <Typography variant="body2" fontWeight={600} color="text.primary">
        {prefix}
        {formatCurrency(amount)}
      </Typography>
    </Stack>
  )
}

export function PaymentSummary({ payment, showBreakdown = false }) {
  const subtotal = Number(payment?.baseCharge ?? 0)
  const extraCharges = Number(payment?.weightCharge ?? 0)
  const taxCharge = Number(payment?.taxCharge ?? 0)
  const total = Number(payment?.amount ?? 0)

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            Payment details
          </Typography>

          {payment ? (
            <Stack spacing={2}>
              <SummaryRow label="Subtotal" amount={subtotal} />
              <SummaryRow
                label="Extra charges"
                amount={extraCharges}
                prefix="+ "
                helper={showBreakdown ? 'Extra charges are based on Approx. Weight' : undefined}
              />
              <SummaryRow
                label="Tax"
                amount={taxCharge}
                prefix="+ "
                helper={`Municipal levy (${TAX_RATE_PERCENT}%)`}
              />

              <Divider flexItem sx={{ my: 1 }} />

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  Total
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} color="primary.main">
                  {formatCurrency(total)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                (Subtotal + Extra charges + Tax)
              </Typography>
              {!payment.required || total <= 0 ? (
                <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                  No payment required for this request.
                </Alert>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Enter your request details and check availability to see the estimated charges for your pickup.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
