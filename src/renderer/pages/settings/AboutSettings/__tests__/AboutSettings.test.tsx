import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  request: vi.fn(),
  search: {} as Record<string, unknown>,
  showDoctor: vi.fn()
}))

vi.mock('@renderer/components/doctor', () => ({
  DoctorPopup: { show: (...args: unknown[]) => mocks.showDoctor(...args) }
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.request }
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/settings/about' }),
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search
}))

vi.mock('@renderer/hooks/useAppUpdateState', () => ({
  useAppUpdateState: () => ({
    appUpdateState: {
      available: false,
      checking: false,
      downloaded: false,
      downloading: false,
      downloadProgress: 0,
      info: null
    },
    updateAppUpdateState: vi.fn()
  })
}))

vi.mock('@renderer/hooks/useMiniAppPopup', () => ({
  useMiniAppPopup: () => ({ openSmartMiniApp: vi.fn() })
}))

vi.mock('@renderer/hooks/useOpenReleaseNotes', () => ({
  useOpenReleaseNotes: () => vi.fn()
}))

vi.mock('@renderer/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' })
}))

vi.mock('@renderer/components/UpdateDialogPopup', () => ({
  default: { show: vi.fn() }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'settings.doctor.entry.title' ? 'System diagnostics' : key)
  })
}))

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

// Forwards alt so empty-alt decorative logos stay hidden even without the wrapper.
vi.mock('@renderer/components/icons/LogoAvatar', () => ({
  default: ({ logo, alt }: { logo: string; alt?: string }) => <img src={logo} alt={alt} />
}))

import { AboutSettings } from '..'

describe('AboutSettings diagnostics entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search = {}
    mocks.request.mockImplementation(async (route: string) => {
      if (route === 'app.get_info') return { isPortable: false, version: '2.0.0' }
      return undefined
    })
  })

  it('places diagnostics next to the debug panel and keeps unavailable About actions disabled', async () => {
    render(<AboutSettings />)
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('app.get_info'))

    const unavailableButtons = screen.getAllByRole('button', { name: 'settings.about.temporarilyUnavailable' })
    expect(unavailableButtons).toHaveLength(9)
    expect(unavailableButtons.every((button) => button.hasAttribute('disabled'))).toBe(true)

    unavailableButtons.forEach((button) => button.click())
    expect(screen.queryByText('diagnostic-dialog-open')).not.toBeInTheDocument()
  })
})
