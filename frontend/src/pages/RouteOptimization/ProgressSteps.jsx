import { CheckCircle2, Loader2, Circle } from 'lucide-react'

const iconByStatus = status => {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'active') return <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
  return <Circle className="h-4 w-4 text-slate-400" />
}

export default function ProgressSteps({ steps }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
      <p className="text-sm font-semibold text-emerald-700">Route optimization in progress…</p>
      <ul className="mt-4 space-y-3 text-sm">
        {steps.map(step => (
          <li key={step.label} className="flex items-center gap-3">
            {iconByStatus(step.status)}
            <span className={step.status === 'done' ? 'text-slate-600' : 'text-slate-500'}>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
