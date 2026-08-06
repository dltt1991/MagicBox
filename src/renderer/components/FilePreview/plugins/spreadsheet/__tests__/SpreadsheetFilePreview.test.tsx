// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import type { AbsoluteFilePath } from '@shared/types/file'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fsRead: vi.fn(),
  fsReadText: vi.fn(),
  getMetadata: vi.fn(),
  loggerError: vi.fn(),
  readWorkbook: vi.fn(),
  sheetToJson: vi.fn()
}))

vi.mock('@e965/xlsx', () => ({
  read: mocks.readWorkbook,
  utils: {
    sheet_to_json: mocks.sheetToJson
  }
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: mocks.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  }
}))

vi.mock('@cherrystudio/ui', () => ({
  EmptyState: ({ title, description }: { title?: string; description?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
  Scrollbar: ({ children, ...props }: PropsWithChildren<React.ComponentPropsWithoutRef<'div'>>) => (
    <div {...props}>{children}</div>
  )
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import SpreadsheetFilePreview from '../SpreadsheetFilePreview'

const filePath = '/tmp/workbook/sales.xlsx' as AbsoluteFilePath

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fsRead.mockResolvedValue(new Uint8Array([80, 75, 3, 4]))
  mocks.fsReadText.mockResolvedValue('Name,Amount\nAlpha,12\n"Beta, B",0\n')
  mocks.getMetadata.mockResolvedValue({ kind: 'file', size: 1024 })
  mocks.readWorkbook.mockReturnValue({
    SheetNames: ['Q1'],
    Sheets: { Q1: {} }
  })
  mocks.sheetToJson.mockReturnValue([
    ['Name', 'Amount'],
    ['Alpha', 12],
    ['Beta', 0]
  ])
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { fs: { read: mocks.fsRead, readText: mocks.fsReadText }, file: { getMetadata: mocks.getMetadata } }
  })
})

afterEach(cleanup)

describe('SpreadsheetFilePreview', () => {
  it('loads spreadsheet bytes and renders the first sheet as a read-only table', async () => {
    render(
      <SpreadsheetFilePreview filePath={filePath} fileName="sales.xlsx" metadata={{ size: 1024 }} refreshKey={0} />
    )

    expect(screen.getByRole('status')).toHaveTextContent('file_preview.loading')
    expect(await screen.findByRole('table', { name: 'Q1' })).toBeInTheDocument()

    expect(mocks.fsRead).toHaveBeenCalledWith(filePath)
    expect(mocks.readWorkbook).toHaveBeenCalledWith(expect.any(Uint8Array), { type: 'array' })
    expect(mocks.sheetToJson).toHaveBeenCalledWith({}, { blankrows: false, defval: '', header: 1 })
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument()
  })

  it('renders CSV files through the same spreadsheet table path', async () => {
    const csvPath = '/tmp/workbook/data.csv' as AbsoluteFilePath

    render(<SpreadsheetFilePreview filePath={csvPath} fileName="data.csv" metadata={{ size: 1024 }} refreshKey={0} />)

    await screen.findByRole('table', { name: 'data.csv' })

    expect(mocks.fsReadText).toHaveBeenCalledWith(csvPath)
    expect(mocks.fsRead).not.toHaveBeenCalled()
    expect(mocks.readWorkbook).not.toHaveBeenCalled()
    expect(screen.getByRole('cell', { name: 'Beta, B' })).toBeInTheDocument()
  })

  it('does not reject oversized CSV files before reading text', async () => {
    const csvPath = '/tmp/workbook/large.csv' as AbsoluteFilePath
    mocks.getMetadata.mockResolvedValueOnce({ kind: 'file', size: 25 * 1024 * 1024 + 1 })

    render(
      <SpreadsheetFilePreview
        filePath={csvPath}
        fileName="large.csv"
        metadata={{ size: 25 * 1024 * 1024 + 1 }}
        refreshKey={0}
      />
    )

    expect(await screen.findByRole('table', { name: 'large.csv' })).toBeInTheDocument()
    expect(mocks.fsReadText).toHaveBeenCalledWith(csvPath)
    expect(mocks.fsRead).not.toHaveBeenCalled()
    expect(mocks.readWorkbook).not.toHaveBeenCalled()
  })

  it('shows an empty state when the workbook has no cells', async () => {
    mocks.sheetToJson.mockReturnValueOnce([])

    render(
      <SpreadsheetFilePreview filePath={filePath} fileName="sales.xlsx" metadata={{ size: 1024 }} refreshKey={0} />
    )

    await waitFor(() =>
      expect(screen.getByTestId('empty-state')).toHaveTextContent('file_preview.spreadsheet.empty.title')
    )
  })

  it('contains read failures inside the preview and logs the cause', async () => {
    const error = new Error('bad workbook')
    mocks.fsRead.mockRejectedValueOnce(error)

    render(
      <SpreadsheetFilePreview filePath={filePath} fileName="sales.xlsx" metadata={{ size: 1024 }} refreshKey={0} />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('file_preview.load_error.title')
    expect(screen.getByRole('alert')).toHaveTextContent('file_preview.load_error.description')
    expect(mocks.loggerError).toHaveBeenCalledWith(`Failed to load spreadsheet preview: ${filePath}`, error)
  })
})
