import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AboutSettings from '../AboutSettings'

const { ipcRequestMock, openSmartMiniAppMock, setPreferenceMock, updateAppUpdateStateMock } = vi.hoisted(() => ({
  ipcRequestMock: vi.fn(),
  openSmartMiniAppMock: vi.fn(),
  setPreferenceMock: vi.fn(),
  updateAppUpdateStateMock: vi.fn()
}))

vi.mock('@cherrystudio/ui', () => ({
  Badge: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  Button: ({
    children,
    disabled,
    loading,
    onClick
  }: {
    children: ReactNode
    disabled?: boolean
    loading?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
  CircularProgress: () => <div data-testid="circular-progress" />,
  Divider: () => <hr />,
  SegmentedControl: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      segmented
    </button>
  ),
  Switch: ({
    checked,
    disabled,
    onCheckedChange
  }: {
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}>
      switch
    </button>
  ),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@data/hooks/usePreference', () => ({
  usePreference: () => [false, setPreferenceMock]
}))

vi.mock('@renderer/assets/images/logo.png', () => ({
  default: 'logo.png'
}))

vi.mock('@renderer/components/icons/LogoAvatar', () => ({
  default: () => <div data-testid="logo-avatar" />
}))

vi.mock('@renderer/components/IndicatorLight', () => ({
  default: () => <span data-testid="indicator-light" />
}))

vi.mock('../FeedbackDialog', () => ({
  FeedbackDialog: () => null
}))

vi.mock('@renderer/components/UpdateDialogPopup', () => ({
  default: { show: vi.fn() }
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
    updateAppUpdateState: updateAppUpdateStateMock
  })
}))

vi.mock('@renderer/hooks/useMiniAppPopup', () => ({
  useMiniAppPopup: () => ({ openSmartMiniApp: openSmartMiniAppMock })
}))

vi.mock('@renderer/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' })
}))

vi.mock('@renderer/i18n/resolver', () => ({
  default: { language: 'zh-CN' }
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: ipcRequestMock }
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
    t: (key: string) =>
      ({
        'docs.title': '文档',
        'settings.about.careers.button': '查看',
        'settings.about.careers.title': '加入我们',
        'settings.about.checkUpdate.label': '检查更新',
        'settings.about.contact.button': '邮件',
        'settings.about.contact.title': '邮件联系',
        'settings.about.debug.open': '打开',
        'settings.about.debug.title': '调试面板',
        'settings.about.description': '一款为创造者而生的 AI 助手',
        'settings.about.enterprise.title': '企业版',
        'settings.about.feedback.button': '反馈',
        'settings.about.feedback.title': '意见反馈',
        'settings.about.releases.button': '查看',
        'settings.about.releases.title': '更新日志',
        'settings.about.temporarilyUnavailable': '暂不可用',
        'settings.about.title': '关于我们',
        'settings.about.website.button': '查看',
        'settings.about.website.title': '官方网站',
        'settings.general.auto_check_update.title': '自动检查更新',
        'settings.general.test_plan.title': '测试计划',
        'settings.general.test_plan.tooltip': '测试计划'
      })[key] ?? key
  })
}))

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

describe('AboutSettings', () => {
  beforeEach(() => {
    ipcRequestMock.mockReset()
    ipcRequestMock.mockImplementation((route: string) => {
      if (route === 'app.get_info') {
        return Promise.resolve({ appPath: '/app', isPortable: false, version: '1.2.3' })
      }
      return Promise.resolve(undefined)
    })
    openSmartMiniAppMock.mockReset()
    setPreferenceMock.mockReset()
    updateAppUpdateStateMock.mockReset()
  })

  it('marks About page actions as temporarily unavailable', async () => {
    render(<AboutSettings />)

    await screen.findByText('Magic Box')

    const unavailableButtons = screen.getAllByRole('button', { name: '暂不可用' })
    expect(unavailableButtons).toHaveLength(9)
    expect(unavailableButtons.every((button) => button.hasAttribute('disabled'))).toBe(true)

    for (const button of unavailableButtons) {
      fireEvent.click(button)
    }
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toBeDisabled()
      fireEvent.click(toggle)
    }

    await waitFor(() => expect(ipcRequestMock).toHaveBeenCalledTimes(1))
    expect(ipcRequestMock).toHaveBeenCalledWith('app.get_info')
    expect(openSmartMiniAppMock).not.toHaveBeenCalled()
    expect(setPreferenceMock).not.toHaveBeenCalled()
    expect(updateAppUpdateStateMock).not.toHaveBeenCalled()
  })
})
