import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle'
import FileWarning from 'lucide-react/dist/esm/icons/file-warning'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { getFilePreviewExtension } from '@renderer/utils/filePreview'

import { FilePreviewLayout } from '../../FilePreviewLayout'
import type { FilePreviewPluginProps } from '../../types'

const logger = loggerService.withContext('DelimitedSpreadsheetFilePreview')
const MAX_RENDERED_ROWS = 500
const MAX_RENDERED_COLUMNS = 50

interface DelimitedSpreadsheetData {
  columnCount: number
  rows: string[][]
  truncated: boolean
}

function parseDelimitedRows(text: string, delimiter: ',' | '\t'): string[][] {
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
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
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

function projectRows(rawRows: string[][]): DelimitedSpreadsheetData | null {
  const rows = rawRows.filter((row) => row.some((cell) => cell.length > 0))
  if (rows.length === 0) return null
  const columnCount = Math.min(MAX_RENDERED_COLUMNS, Math.max(...rows.map((row) => row.length), 1))
  return {
    columnCount,
    rows: rows.slice(0, MAX_RENDERED_ROWS).map((row) => row.slice(0, columnCount)),
    truncated: rows.length > MAX_RENDERED_ROWS || rows.some((row) => row.length > MAX_RENDERED_COLUMNS)
  }
}

export default function DelimitedSpreadsheetFilePreview({ filePath, fileName, refreshKey }: FilePreviewPluginProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<DelimitedSpreadsheetData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(false)
    setLoading(true)
    void window.api.fs
      .readText(filePath)
      .then((text) => {
        if (cancelled) return
        const delimiter = getFilePreviewExtension(filePath) === 'tsv' ? '\t' : ','
        setData(projectRows(parseDelimitedRows(text, delimiter)))
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        logger.error(
          `Failed to load spreadsheet preview: ${filePath}`,
          loadError instanceof Error ? loadError : new Error(String(loadError))
        )
        setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filePath, refreshKey])

  return (
    <FilePreviewLayout.Frame>
      <FilePreviewLayout.Content>
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-background">
          {loading ? (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              <span>{t('file_preview.loading')}</span>
            </div>
          ) : error ? (
            <div role="alert" className="h-full">
              <EmptyState
                icon={AlertCircle}
                title={t('file_preview.load_error.title')}
                description={t('file_preview.load_error.description')}
                className="h-full"
              />
            </div>
          ) : data ? (
            <div className="h-full overflow-auto p-3">
              <table aria-label={fileName} className="w-max min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    {Array.from({ length: data.columnCount }, (_, index) => (
                      <th
                        key={index}
                        scope="col"
                        className="border border-border bg-muted/60 px-2 py-1 text-left font-medium text-muted-foreground">
                        {data.rows[0]?.[index] || t('file_preview.spreadsheet.column', { index: index + 1 })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: data.columnCount }, (_, columnIndex) => (
                        <td key={columnIndex} className="border border-border px-2 py-1 align-top">
                          {row[columnIndex] ?? ''}
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
            <EmptyState
              icon={FileWarning}
              title={t('file_preview.spreadsheet.empty.title')}
              description={t('file_preview.spreadsheet.empty.description')}
              className="h-full"
            />
          )}
        </div>
      </FilePreviewLayout.Content>
    </FilePreviewLayout.Frame>
  )
}
