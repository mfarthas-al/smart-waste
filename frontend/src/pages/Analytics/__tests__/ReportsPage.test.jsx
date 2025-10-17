import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const jsPDFInstances = []
  const jsPDFConstructor = vi.fn(() => {
    const instance = {
      setFontSize: vi.fn(),
      text: vi.fn(),
      save: vi.fn(),
    }
    jsPDFInstances.push(instance)
    return instance
  })
  const bookNewMock = vi.fn(() => ({}))
  const jsonToSheetMock = vi.fn(() => ({}))
  const bookAppendSheetMock = vi.fn()
  const writeFileMock = vi.fn()
  return {
    jsPDFInstances,
    jsPDFConstructor,
    bookNewMock,
    jsonToSheetMock,
    bookAppendSheetMock,
    writeFileMock,
  }
})

vi.mock('jspdf', () => ({
  default: mocks.jsPDFConstructor,
}))

vi.mock('xlsx', () => ({
  utils: {
    book_new: mocks.bookNewMock,
    json_to_sheet: mocks.jsonToSheetMock,
    book_append_sheet: mocks.bookAppendSheetMock,
  },
  writeFile: mocks.writeFileMock,
}))

import ReportsPage from '../ReportsPage.jsx'

function createFetchResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload,
  }
}

describe('ReportsPage', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  mocks.jsPDFConstructor.mockClear()
  mocks.jsPDFInstances.length = 0
  mocks.bookNewMock.mockClear()
  mocks.jsonToSheetMock.mockClear()
  mocks.bookAppendSheetMock.mockClear()
  mocks.writeFileMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads configuration defaults and allows toggling sections', async () => {
    fetchMock.mockImplementation(url => {
      if (url === '/api/analytics/config') {
        return Promise.resolve(createFetchResponse({
          filters: {
            defaultDateRange: { from: '2024-01-01', to: '2024-01-15' },
            regions: ['Colombo', 'Galle'],
            wasteTypes: ['Organic'],
            billingModels: ['Subscription'],
          },
        }))
      }
      return Promise.resolve(createFetchResponse({}))
    })

    render(<ReportsPage session={{ id: 'user-123' }} />)

    const fromInputs = await screen.findAllByLabelText(/^From/i)
    expect(fromInputs[0]).toHaveValue('2024-01-01')
    const toInputs = await screen.findAllByLabelText(/^To/i)
    expect(toInputs[0]).toHaveValue('2024-01-15')

    const user = userEvent.setup()
    const timelineSwitches = await screen.findAllByRole('checkbox', { name: /Trend timeline/i })
    const timelineSwitch = timelineSwitches[timelineSwitches.length - 1]
    expect(timelineSwitch).toBeChecked()
    await user.click(timelineSwitch)
    expect(timelineSwitch).not.toBeChecked()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/analytics/config')
    })
  })

  it('shows a validation error when date range is incomplete', async () => {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/analytics/config') {
        return Promise.resolve(createFetchResponse({
          filters: {
            defaultDateRange: { from: '2024-01-01', to: '2024-01-15' },
            regions: [],
            wasteTypes: [],
            billingModels: [],
          },
        }))
      }
      return Promise.resolve(createFetchResponse({}))
    })

    render(<ReportsPage session={{ id: 'user-123' }} />)

  const user = userEvent.setup()
  const fromInputs = await screen.findAllByLabelText(/^From/i)
  const toInputs = await screen.findAllByLabelText(/^To/i)
  await user.clear(fromInputs[fromInputs.length - 1])
  await user.clear(toInputs[toInputs.length - 1])
  expect(fromInputs[fromInputs.length - 1]).toHaveValue('')
  expect(toInputs[toInputs.length - 1]).toHaveValue('')

    const submitButtons = await screen.findAllByRole('button', { name: /Generate report/i })
    const submitButton = submitButtons[submitButtons.length - 1]
    const form = submitButton.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form)

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      const hasValidationMessage = alerts.some(alert => (alert.textContent || '').toLowerCase().includes('start and end date'))
      expect(hasValidationMessage).toBe(true)
    })

    const reportCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/analytics/report')
    expect(reportCalls).toHaveLength(0)
  })

  it('renders report results and enables exports', async () => {
    const reportPayload = {
      data: {
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-10' },
          regions: ['Colombo'],
          wasteTypes: ['Organic'],
          billingModels: ['Subscription'],
        },
        totals: {
          records: 14,
          totalWeightKg: 260,
          recyclableWeightKg: 180,
          nonRecyclableWeightKg: 80,
        },
        tables: {
          regions: [{ region: 'Colombo', totalKg: 120 }],
          households: [
            {
              householdId: 'HH-001',
              region: 'Colombo',
              billingModel: 'Subscription',
              pickups: 6,
              totalKg: 95,
            },
          ],
          wasteTypes: [{ wasteType: 'Organic', totalKg: 160 }],
        },
        charts: {
          regionSummary: [{ region: 'Colombo', totalKg: 120 }],
          wasteSummary: [{ wasteType: 'Organic', totalKg: 160 }],
          timeSeries: [
            { day: '2024-01-01', totalKg: 14 },
            { day: '2024-01-02', totalKg: 18 },
          ],
        },
      },
    }

    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/analytics/config') {
        return Promise.resolve(createFetchResponse({
          filters: {
            defaultDateRange: { from: '2024-01-01', to: '2024-01-31' },
            regions: ['Colombo', 'Kandy'],
            wasteTypes: ['Organic', 'Plastic'],
            billingModels: ['Subscription'],
          },
        }))
      }
      if (url === '/api/analytics/report' && options?.method === 'POST') {
        return Promise.resolve(createFetchResponse(reportPayload))
      }
      return Promise.resolve(createFetchResponse({}))
    })

    render(<ReportsPage session={{ id: 'user-123' }} />)

    const user = userEvent.setup()
    const fromInputs = await screen.findAllByLabelText(/^From/i)
    const toInputs = await screen.findAllByLabelText(/^To/i)
    await waitFor(() => {
      expect(fromInputs[fromInputs.length - 1]).not.toHaveValue('')
      expect(toInputs[toInputs.length - 1]).not.toHaveValue('')
    })
    const submitButtons = await screen.findAllByRole('button', { name: /Generate report/i })
    const submitButton = submitButtons[submitButtons.length - 1]
    const formElement = submitButton.closest('form')
    expect(formElement).not.toBeNull()
    fireEvent.submit(formElement)

    expect(await screen.findByText(/Report summary/i)).toBeInTheDocument()
    expect(screen.getByText(/Waste generated per household/i)).toBeInTheDocument()

    const pdfButton = screen.getByRole('button', { name: /Export PDF/i })
    await user.click(pdfButton)
    expect(mocks.jsPDFConstructor).toHaveBeenCalledTimes(1)
    expect(mocks.jsPDFInstances).toHaveLength(1)
    expect(mocks.jsPDFInstances[0].save).toHaveBeenCalledWith('smart-waste-analytics.pdf')

    const excelButton = screen.getByRole('button', { name: /Export Excel/i })
    await user.click(excelButton)
    expect(mocks.writeFileMock).toHaveBeenCalledWith(expect.any(Object), 'smart-waste-analytics.xlsx')
    expect(mocks.bookAppendSheetMock).toHaveBeenCalled()
  })

  it('shows an informational message when no records are returned', async () => {
    const reportPayload = {
      data: {
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-10' },
          regions: ['Colombo'],
          wasteTypes: ['Organic'],
          billingModels: ['Subscription'],
        },
        totals: {
          records: 14,
          totalWeightKg: 260,
          recyclableWeightKg: 180,
          nonRecyclableWeightKg: 80,
        },
        tables: {
          regions: [{ region: 'Colombo', totalKg: 120 }],
          households: [
            {
              householdId: 'HH-001',
              region: 'Colombo',
              billingModel: 'Subscription',
              pickups: 6,
              totalKg: 95,
            },
          ],
          wasteTypes: [{ wasteType: 'Organic', totalKg: 160 }],
        },
        charts: {
          regionSummary: [{ region: 'Colombo', totalKg: 120 }],
          wasteSummary: [{ wasteType: 'Organic', totalKg: 160 }],
          timeSeries: [
            { day: '2024-01-01', totalKg: 14 },
            { day: '2024-01-02', totalKg: 18 },
          ],
        },
      },
    }

    let reportCallCount = 0
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/analytics/config') {
        return Promise.resolve(createFetchResponse({
          filters: {
            defaultDateRange: { from: '2024-01-01', to: '2024-01-31' },
            regions: ['Colombo'],
            wasteTypes: ['Organic'],
            billingModels: ['Subscription'],
          },
        }))
      }
      if (url === '/api/analytics/report' && options?.method === 'POST') {
        reportCallCount += 1
        if (reportCallCount === 1) {
          return Promise.resolve(createFetchResponse(reportPayload))
        }
        return Promise.resolve(createFetchResponse({
          message: 'Nothing to report',
          data: null,
        }))
      }
      return Promise.resolve(createFetchResponse({}))
    })

    render(<ReportsPage session={{ id: 'user-123' }} />)

    const fromInputs = await screen.findAllByLabelText(/^From/i)
    const toInputs = await screen.findAllByLabelText(/^To/i)
    await waitFor(() => {
      expect(fromInputs[fromInputs.length - 1]).not.toHaveValue('')
      expect(toInputs[toInputs.length - 1]).not.toHaveValue('')
    })

    const submitButtons = await screen.findAllByRole('button', { name: /Generate report/i })
    const submitButton = submitButtons[submitButtons.length - 1]
    const formElement = submitButton.closest('form')
    expect(formElement).not.toBeNull()

    fireEvent.submit(formElement)
    expect(await screen.findByText(/Report summary/i)).toBeInTheDocument()

    fireEvent.submit(formElement)
    await waitFor(() => {
      const reportCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/analytics/report')
      expect(reportCalls).toHaveLength(2)
    })
    expect(await screen.findByText(/Nothing to report/i)).toBeInTheDocument()
  })
})
