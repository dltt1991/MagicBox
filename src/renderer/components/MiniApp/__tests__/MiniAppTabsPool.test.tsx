import type { MiniApp } from '@shared/data/types/miniApp'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockWebviews = vi.hoisted(
  () =>
    new Map<
      string,
      {
        style: { display?: string }
        reload: ReturnType<typeof vi.fn>
        reloadIgnoringCache: ReturnType<typeof vi.fn>
        isLoading: ReturnType<typeof vi.fn>
      }
    >()
)

const getMockWebview = (appid: string) => {
  let webview = mockWebviews.get(appid)
  if (!webview) {
    webview = {
      style: {},
      reload: vi.fn(),
      reloadIgnoringCache: vi.fn(),
      isLoading: vi.fn(() => false)
    }
    mockWebviews.set(appid, webview)
  }
  return webview
}

// `WebviewContainer` renders an Electron `<webview>` element which JSDOM can't
// instantiate. Stub it with a div carrying the same `data-mini-app-id` so DOM
// order assertions still work.
vi.mock('@renderer/components/MiniApp/WebviewContainer', () => ({
  default: ({
    appid,
    url,
    onSetRefCallback
  }: {
    appid: string
    url: string
    onSetRefCallback: (appid: string, el: unknown) => void
  }) => {
    onSetRefCallback(appid, getMockWebview(appid))
    return <div data-mini-app-id={appid} data-testid={`webview-${appid}`} data-url={url} />
  }
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn()
    })
  }
}))

const stubApp = (id: string): MiniApp => ({
  appId: id,
  name: id,
  url: `https://${id}.example.com`,
  presetMiniAppId: id as MiniApp['presetMiniAppId'],
  status: 'enabled',
  orderKey: 'a0'
})

const mocks = vi.hoisted(() => ({
  openedKeepAliveMiniApps: [] as MiniApp[],
  currentMiniAppId: '',
  tabs: [] as { id: string; url: string }[],
  activeTabId: ''
}))

vi.mock('@renderer/hooks/useMiniApps', () => ({
  useMiniApps: () => ({
    openedKeepAliveMiniApps: mocks.openedKeepAliveMiniApps,
    currentMiniAppId: mocks.currentMiniAppId
  })
}))

vi.mock('@renderer/hooks/tab', () => ({
  useTabs: () => ({
    tabs: mocks.tabs,
    activeTabId: mocks.activeTabId
  })
}))

vi.mock('@renderer/utils/webviewStateManager', () => ({
  getWebviewLoaded: () => false,
  setWebviewLoaded: vi.fn()
}))

import MiniAppTabsPool from '../MiniAppTabsPool'

const renderedAppIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-mini-app-id]')).map((el) => el.dataset.miniAppId as string)

const renderedAppUrls = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-mini-app-id]')).map((el) => el.dataset.url as string)

describe('MiniAppTabsPool', () => {
  let now = 1_000

  beforeEach(() => {
    mocks.openedKeepAliveMiniApps = []
    mocks.currentMiniAppId = ''
    mocks.tabs = []
    mocks.activeTabId = ''
    mockWebviews.clear()
    now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders webviews in stable appId-sorted order regardless of LRU order', () => {
    // Three apps. The hook returns them in LRU order (most-recent last).
    mocks.openedKeepAliveMiniApps = [stubApp('charlie'), stubApp('alpha'), stubApp('bravo')]
    mocks.currentMiniAppId = 'alpha'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/alpha' }]
    mocks.activeTabId = 't1'

    const { container, rerender } = render(<MiniAppTabsPool />)

    // Always sorted by appId, NOT by LRU order — otherwise React would move
    // <webview> DOM nodes when the LRU touches an app, and Electron <webview>
    // loses its content on detach/reattach.
    expect(renderedAppIds(container)).toEqual(['alpha', 'bravo', 'charlie'])

    // LRU touches "charlie" — list re-orders, but the rendered DOM order must
    // stay the same so no <webview> gets moved.
    mocks.openedKeepAliveMiniApps = [stubApp('alpha'), stubApp('bravo'), stubApp('charlie')]
    mocks.currentMiniAppId = 'charlie'
    rerender(<MiniAppTabsPool />)

    expect(renderedAppIds(container)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('keeps DOM order stable when an app is added (only the new one inserts in sort position)', () => {
    mocks.openedKeepAliveMiniApps = [stubApp('alpha'), stubApp('charlie')]
    mocks.currentMiniAppId = 'alpha'
    const { container, rerender } = render(<MiniAppTabsPool />)
    expect(renderedAppIds(container)).toEqual(['alpha', 'charlie'])

    // Adding "bravo" must place it between alpha/charlie alphabetically — the
    // existing two webviews retain their DOM positions.
    mocks.openedKeepAliveMiniApps = [stubApp('alpha'), stubApp('charlie'), stubApp('bravo')]
    rerender(<MiniAppTabsPool />)
    expect(renderedAppIds(container)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('updates WebviewContainer props when an opened app changes without changing appId', () => {
    mocks.openedKeepAliveMiniApps = [stubApp('alpha'), stubApp('bravo')]
    mocks.currentMiniAppId = 'alpha'
    const { container, rerender } = render(<MiniAppTabsPool />)
    expect(renderedAppIds(container)).toEqual(['alpha', 'bravo'])
    expect(renderedAppUrls(container)).toEqual(['https://alpha.example.com', 'https://bravo.example.com'])

    mocks.openedKeepAliveMiniApps = [
      { ...stubApp('bravo'), url: 'https://bravo.example.com' },
      { ...stubApp('alpha'), url: 'https://renamed-alpha.example.com' }
    ]
    rerender(<MiniAppTabsPool />)

    expect(renderedAppIds(container)).toEqual(['alpha', 'bravo'])
    expect(renderedAppUrls(container)).toEqual(['https://renamed-alpha.example.com', 'https://bravo.example.com'])
  })

  it('reloads Kimi after it becomes visible following a long idle period', () => {
    const moonshot = { ...stubApp('moonshot'), presetMiniAppId: 'moonshot', url: 'https://kimi.moonshot.cn/' }
    const doubao = { ...stubApp('doubao'), presetMiniAppId: 'doubao', url: 'https://www.doubao.com/chat/' }
    mocks.openedKeepAliveMiniApps = [moonshot, doubao]
    mocks.currentMiniAppId = 'moonshot'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/moonshot' }]
    mocks.activeTabId = 't1'

    const { rerender } = render(<MiniAppTabsPool />)

    mocks.currentMiniAppId = 'doubao'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/doubao' }]
    rerender(<MiniAppTabsPool />)

    now += 16 * 60 * 1000
    mocks.currentMiniAppId = 'moonshot'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/moonshot' }]
    rerender(<MiniAppTabsPool />)

    expect(getMockWebview('moonshot').reloadIgnoringCache).toHaveBeenCalledTimes(1)
  })

  it('does not reload Kimi after a short idle period', () => {
    const moonshot = { ...stubApp('moonshot'), presetMiniAppId: 'moonshot', url: 'https://kimi.moonshot.cn/' }
    const doubao = { ...stubApp('doubao'), presetMiniAppId: 'doubao', url: 'https://www.doubao.com/chat/' }
    mocks.openedKeepAliveMiniApps = [moonshot, doubao]
    mocks.currentMiniAppId = 'moonshot'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/moonshot' }]
    mocks.activeTabId = 't1'

    const { rerender } = render(<MiniAppTabsPool />)

    mocks.currentMiniAppId = 'doubao'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/doubao' }]
    rerender(<MiniAppTabsPool />)

    now += 5 * 60 * 1000
    mocks.currentMiniAppId = 'moonshot'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/moonshot' }]
    rerender(<MiniAppTabsPool />)

    expect(getMockWebview('moonshot').reloadIgnoringCache).not.toHaveBeenCalled()
  })

  it('does not reload other mini apps after a long idle period', () => {
    const alpha = stubApp('alpha')
    const bravo = stubApp('bravo')
    mocks.openedKeepAliveMiniApps = [alpha, bravo]
    mocks.currentMiniAppId = 'alpha'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/alpha' }]
    mocks.activeTabId = 't1'

    const { rerender } = render(<MiniAppTabsPool />)

    mocks.currentMiniAppId = 'bravo'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/bravo' }]
    rerender(<MiniAppTabsPool />)

    now += 16 * 60 * 1000
    mocks.currentMiniAppId = 'alpha'
    mocks.tabs = [{ id: 't1', url: '/app/mini-app/alpha' }]
    rerender(<MiniAppTabsPool />)

    expect(getMockWebview('alpha').reloadIgnoringCache).not.toHaveBeenCalled()
  })
})
