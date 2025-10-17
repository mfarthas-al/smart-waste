import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({ render: renderMock }))

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
}))

vi.mock('@mui/x-date-pickers/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }) => children,
}))

vi.mock('@mui/x-date-pickers/AdapterDayjs', () => ({
  AdapterDayjs: class {},
}))

vi.mock('@mui/x-date-pickers/DateCalendar', () => ({
  DateCalendar: () => null,
}))

vi.mock('@mui/x-date-pickers/DigitalClock', () => ({
  DigitalClock: () => null,
}))

describe('main entry', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    renderMock.mockClear()
    createRootMock.mockClear()
  })

  it('mounts the React application into the root element', async () => {
    await import('./main.jsx')

    expect(createRootMock).toHaveBeenCalledTimes(1)
    const rootArg = createRootMock.mock.calls[0][0]
    expect(rootArg).toBeInstanceOf(HTMLElement)
    expect(rootArg.id).toBe('root')
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})
