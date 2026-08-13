import { EmptyState } from '@cherrystudio/ui'
import type * as XLSX from '@e965/xlsx'
import { loggerService } from '@logger'
import { getFilePreviewExtension } from '@renderer/utils/filePreview'
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle'
import FileWarning from 'lucide-react/dist/esm/icons/file-warning'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FilePreviewLayout } from '../../FilePreviewLayout'
import type { FilePreviewPluginProps } from '../../types'

const logger = loggerService.withContext('SpreadsheetFilePreview')
const SPREADSHEET_PREVIEW_MAX_SIZE_MIB = 25
const SPREADSHEET_PREVIEW_MAX_SIZE_BYTES = SPREADSHEET_PREVIEW_MAX_SIZE_MIB * 1024 * 1024
const MAX_RENDERED_ROWS = 500
const MAX_RENDERED_COLUMNS = 50

type CellValue = string | number | boolean | Date | null

interface SpreadsheetData {
  columnCount: number
  rows: CellValue[][]
  sheetName: string
  truncated: boolean
}

function toUint8Array(data: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function assertSourceSize(size: number): void {
  if (size > SPREADSHEET_PREVIEW_MAX_SIZE_BYTES) {
    throw new Error('Spreadsheet preview supports files up to 25 MB')
  }
}

function normalizeCellValue(value: unknown): CellValue {
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatCellValue(value: CellValue): string {
  if (value instanceof Date) return value.toLocaleString()
  if (value === null) return ''
  return String(value)
}

function projectRows(rawRows: unknown[][], sheetName: string): SpreadsheetData | null {
  const rows = rawRows
    .map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))
    .filter((row) => row.some((cell) => formatCellValue(cell).length > 0))
  if (rows.length === 0) return null

  const columnCount = Math.min(MAX_RENDERED_COLUMNS, Math.max(...rows.map((row) => row.length), 1))

  return {
    columnCount,
    rows: rows.slice(0, MAX_RENDERED_ROWS).map((row) => row.slice(0, columnCount)),
    sheetName,
    truncated: rows.length > MAX_RENDERED_ROWS || rows.some((row) => row.length > MAX_RENDERED_COLUMNS)
  }
}

function projectWorkbook(xlsx: typeof XLSX, workbook: XLSX.WorkBook): SpreadsheetData | null {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return null

  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) return null

  const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, { blankrows: false, defval: '', header: 1 })
  return projectRows(rawRows, sheetName)
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function SpreadsheetEmptyState() {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={FileWarning}
      title={t('file_preview.spreadsheet.empty.title')}
      description={t('file_preview.spreadsheet.empty.description')}
      className="h-full"
    />
  )
}

function SpreadsheetErrorState() {
  const { t } = useTranslation()

  return (
    <div role="alert" className="h-full">
      <EmptyState
        icon={AlertCircle}
        title={t('file_preview.load_error.title')}
        description={t('file_preview.load_error.description')}
        className="h-full"
      />
    </div>
  )
}

export default function SpreadsheetFilePreview({ filePath, fileName, metadata, refreshKey }: FilePreviewPluginProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<SpreadsheetData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setData(null)
    setError(null)
    setLoading(true)

    void (async () => {
      try {
        const extension = getFilePreviewExtension(filePath)
        if (cancelled) return
        if (extension !== 'csv') assertSourceSize(metadata.size)

        const nextData =
          extension === 'csv'
            ? projectRows(parseCsvRows(await window.api.fs.readText(filePath)), fileName)
            : await (async () => {
                const bytes = toUint8Array(await window.api.fs.read(filePath))
                assertSourceSize(bytes.byteLength)
                if (cancelled) return null

                const xlsx = await import('@e965/xlsx')
                return projectWorkbook(xlsx, xlsx.read(bytes, { type: 'array' }))
              })()
        if (cancelled) return

        setData(nextData)
      } catch (loadError) {
        if (cancelled) return
        const normalized = loadError instanceof Error ? loadError : new Error(String(loadError))
        logger.error(`Failed to load spreadsheet preview: ${filePath}`, normalized)
        setError(normalized)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fileName, filePath, metadata.size, refreshKey])

  return (
    <FilePreviewLayout.Frame>
      <FilePreviewLayout.Content>
        <div
          className="relative h-full min-h-0 w-full overflow-hidden bg-background"
          data-testid="spreadsheet-file-preview">
          {loading ? (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              <span>{t('file_preview.loading')}</span>
            </div>
          ) : error ? (
            <SpreadsheetErrorState />
          ) : data ? (
            <div className="h-full overflow-auto p-3">
              <table aria-label={data.sheetName} className="w-max min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    {Array.from({ length: data.columnCount }, (_, index) => (
                      <th
                        className="border border-border bg-muted/60 px-2 py-1 text-left font-medium text-muted-foreground"
                        key={index}
                        scope="col">
                        {formatCellValue(data.rows[0]?.[index] ?? '') ||
                          t('file_preview.spreadsheet.column', { index: index + 1 })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: data.columnCount }, (_, columnIndex) => (
                        <td className="border border-border px-2 py-1 align-top" key={columnIndex}>
                          {formatCellValue(row[columnIndex] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.truncated ? (
                <div className="mt-2 text-muted-foreground text-xs">{t('file_preview.spreadsheet.truncated')}</div>
              ) : null}
            </div>
          ) : (
            <SpreadsheetEmptyState />
          )}
        </div>
      </FilePreviewLayout.Content>
    </FilePreviewLayout.Frame>
  )
}
