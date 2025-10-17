import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/dom'
import KpiCard from '../KpiCard.jsx'
import ProgressSteps from '../ProgressSteps.jsx'
import SummaryCard from '../SummaryCard.jsx'
import ZoneSelector from '../ZoneSelector.jsx'

describe('Route optimization components', () => {
  it('renders KPI metrics with helper and icon', () => {
    const DummyIcon = () => <svg data-testid="dummy-icon" />

    render(
      <KpiCard icon={DummyIcon} label="Avg. pickup load" value="2.6 t" helper="Last 7 days" />,
    )

    expect(screen.getByText(/Avg\. pickup load/i)).toBeInTheDocument()
    expect(screen.getByText('2.6 t')).toBeInTheDocument()
    expect(screen.getByText(/Last 7 days/i)).toBeInTheDocument()
    expect(screen.getByTestId('dummy-icon')).toBeInTheDocument()
  })

  it('renders progress steps and shows animated icon for active step', () => {
    const { container } = render(
      <ProgressSteps
        steps={[
          { label: 'Collect telemetry data', status: 'done' },
          { label: 'Optimize routes', status: 'active' },
          { label: 'Dispatch crews', status: 'pending' },
        ]}
      />,
    )

    expect(screen.getByText(/Collect telemetry data/i)).toBeInTheDocument()
    expect(screen.getByText(/Dispatch crews/i)).toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('summarizes route data with fallbacks', () => {
    render(
      <SummaryCard
        plan={{ distanceKm: 12, loadKg: 480 }}
        summary={{ consideredBins: 60, highPriorityBins: 10, trucks: 2, truckCapacityKg: 2400 }}
        directions={{ distanceKm: 11, durationMin: 42 }}
      />,
    )

    expect(screen.getByText(/Route summary/i)).toBeInTheDocument()
    expect(screen.getByText('11 km')).toBeInTheDocument()
    expect(screen.getByText('42 min')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getAllByText(/kg/).length).toBeGreaterThan(0)
  })

  it('allows selecting a city and triggering route generation', async () => {
    const onSelectCity = vi.fn()
    const onSelectWindow = vi.fn()
    const onGenerate = vi.fn()
    const user = userEvent.setup()

    render(
      <ZoneSelector
        cities={[{ name: 'Colombo' }, { name: 'Kandy' }]}
        selectedCity="Colombo"
        zoneDetails={{ totalBins: 120, areaSize: 45, population: '89k', lastCollection: 'Today' }}
        onSelectCity={onSelectCity}
        timeWindow="06:00-10:00"
        availableWindows={['06:00-10:00', '10:00-14:00']}
        onSelectTimeWindow={onSelectWindow}
        onGenerate={onGenerate}
        loading={false}
      />,
    )

    const comboBoxes = screen.getAllByRole('combobox')
    expect(comboBoxes.length).toBeGreaterThanOrEqual(1)

    await user.click(comboBoxes[0])
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByText('Kandy'))

    expect(onSelectCity).toHaveBeenCalledWith('Kandy')

    await user.click(comboBoxes[1])
    const windowList = await screen.findByRole('listbox')
    await user.click(within(windowList).getByText('10:00-14:00'))
    expect(onSelectWindow).toHaveBeenCalledWith('10:00-14:00')

    const generateButton = screen.getByRole('button', { name: /Generate Optimized Route/i })
    await user.click(generateButton)
    expect(onGenerate).toHaveBeenCalled()
  })
})
