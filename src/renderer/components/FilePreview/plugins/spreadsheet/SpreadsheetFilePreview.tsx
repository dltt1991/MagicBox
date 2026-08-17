import { EmptyState, Tabs, TabsList, TabsTrigger } from '@cherrystudio/ui'
import { loggerService } from '@logger'
import { formatFileSize } from '@renderer/utils/file'
import { getFilePreviewExtension } from '@renderer/utils/filePreview'
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle'
import FileSpreadsheet from 'lucide-react/dist/esm/icons/file-spreadsheet'
import FileWarning from 'lucide-react/dist/esm/icons/file-warning'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FilePreviewLayout } from '../../FilePreviewLayout'
import type { FilePreviewPluginProps } from '../../types'
import type { ChartRenderer } from './charts/ChartRenderer'
import type { ChartModel, SheetRenderModel, WorkbookRenderModel } from './renderModel'
import { SpreadsheetFilePreviewToolbar } from './SpreadsheetFilePreviewToolbar'
import { useXlsxWorkbook, XLSX_PREVIEW_MAX_SIZE_BYTES } from './useXlsxWorkbook'
import type { SelectedCellInfo } from './XlsxGrid'
import XlsxGrid from './XlsxGrid'

const logger = loggerService.withContext('SpreadsheetFilePreview')
const MAX_RENDERED_ROWS = 500
const MAX_RENDERED_COLUMNS = 50

/** Zoom levels. The default index is 2 (=1). */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const DEFAULT_ZOOM = 1

type CellValue = string | number | boolean | Date | null

interface DelimitedSpreadsheetData {
  columnCount: number
  rows: CellValue[][]
  sheetName: string
  truncated: boolean
}

const formatZoomLabel = (zoom: number) => `${Math.round(zoom * 100)}%`

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

function projectRows(rawRows: unknown[][], sheetName: string): DelimitedSpreadsheetData | null {
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
      continue
    }

    if (char === '"') {
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

function DelimitedSpreadsheetEmptyState() {
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

function DelimitedSpreadsheetErrorState() {
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

function DelimitedSpreadsheetFilePreview({ filePath, fileName, refreshKey }: FilePreviewPluginProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<DelimitedSpreadsheetData | null>(null)
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
        const delimiter = extension === 'tsv' ? '\t' : ','
        const nextData = projectRows(parseDelimitedRows(await window.api.fs.readText(filePath), delimiter), fileName)
        if (!cancelled) setData(nextData)
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
  }, [fileName, filePath, refreshKey])

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
            <DelimitedSpreadsheetErrorState />
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
            <DelimitedSpreadsheetEmptyState />
          )}
        </div>
      </FilePreviewLayout.Content>
    </FilePreviewLayout.Frame>
  )
}

/** Visible sheets from model.sheets. If all are hidden, fall back to the first sheet so one tab remains selectable. */
const visibleSheets = (model: WorkbookRenderModel): SheetRenderModel[] => {
  const visible = model.sheets.filter((sheet) => !sheet.hidden)
  if (visible.length > 0) return visible
  return model.sheets.slice(0, 1)
}

let chartRendererPromise: Promise<ChartRenderer> | null = null

const loadChartRenderer = () => {
  chartRendererPromise ??= import('./charts/EchartsChartRenderer')
    .then((module) => module.echartsChartRenderer)
    .catch((error: unknown) => {
      chartRendererPromise = null
      throw error
    })
  return chartRendererPromise
}

const sheetHasChart = (sheet: SheetRenderModel | undefined): boolean => Boolean(sheet && sheet.charts.length > 0)

/** Read-only XLSX preview with virtualized sheets, formula status, images, and lazily loaded charts. */
function XlsxSpreadsheetFilePreview({ filePath, fileName, metadata, refreshKey }: FilePreviewPluginProps) {
  const { t } = useTranslation()
  const state = useXlsxWorkbook(filePath, refreshKey, metadata.size)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<SelectedCellInfo | null>(null)
  const [chartRenderer, setChartRenderer] = useState<ChartRenderer | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({})

  const model = state.status === 'ready' ? state.model : null
  const sheets = useMemo(() => (model ? visibleSheets(model) : []), [model])
  const activeSheet = sheets.find((sheet) => sheet.name === activeSheetName) ?? sheets[0] ?? null

  // Reset the selected cell when switching sheets or replacing the model, and clamp the active sheet to a valid value.
  useEffect(() => {
    setSelectedCell(null)
    if (sheets.length === 0) {
      setActiveSheetName(null)
      return
    }
    if (!sheets.some((sheet) => sheet.name === activeSheetName)) {
      setActiveSheetName(sheets[0].name)
    }
  }, [sheets, activeSheetName])

  // Build image object URLs from model.images when ready, then revoke the previous table on replacement/unmount.
  useEffect(() => {
    if (!model) return

    const nextUrls: Record<number, string> = {}
    for (const [imageId, image] of Object.entries(model.images)) {
      nextUrls[Number(imageId)] = URL.createObjectURL(new Blob([image.data], { type: image.mime }))
    }
    setImageUrls(nextUrls)

    return () => {
      for (const url of Object.values(nextUrls)) {
        URL.revokeObjectURL(url)
      }
    }
  }, [model])

  // Lazy-load chart rendering only after the first model containing charts appears.
  useEffect(() => {
    if (chartRenderer || !sheets.some((sheet) => sheetHasChart(sheet))) return
    let cancelled = false
    void loadChartRenderer()
      .then((renderer) => {
        if (!cancelled) setChartRenderer(renderer)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const normalized = error instanceof Error ? error : new Error(String(error))
        logger.error('Failed to load xlsx chart renderer', normalized)
      })
    return () => {
      cancelled = true
    }
  }, [sheets, chartRenderer])

  const renderChart = useMemo(() => {
    if (!chartRenderer) return undefined
    return (chart: ChartModel, container: HTMLElement) => chartRenderer.render(chart, container)
  }, [chartRenderer])

  const zoomIndex = ZOOM_LEVELS.indexOf(zoom)
  const zoomOut = useCallback(() => {
    setZoom((current) => {
      const index = ZOOM_LEVELS.indexOf(current)
      return index > 0 ? ZOOM_LEVELS[index - 1] : current
    })
  }, [])
  const zoomIn = useCallback(() => {
    setZoom((current) => {
      const index = ZOOM_LEVELS.indexOf(current)
      return index >= 0 && index < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[index + 1] : current
    })
  }, [])

  let content: ReactNode

  if (state.status === 'loading' || state.status === 'idle') {
    content = (
      <div
        role="status"
        className="flex h-full w-full items-center justify-center gap-2 bg-background text-muted-foreground text-sm">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        <span>{t('file_preview.loading')}</span>
      </div>
    )
  } else if (state.status === 'error') {
    // state.message carries raw technical detail from the worker and is logged by useXlsxWorkbook.
    content = (
      <EmptyState
        icon={AlertCircle}
        title={t('file_preview.load_error.title')}
        description={t('xlsx_preview.error.description')}
        className="h-full"
      />
    )
  } else if (state.status === 'oversize') {
    content = (
      <EmptyState
        icon={FileSpreadsheet}
        title={t('xlsx_preview.too_large.title')}
        description={t('xlsx_preview.too_large.description', {
          size: formatFileSize(state.sizeBytes),
          limit: formatFileSize(XLSX_PREVIEW_MAX_SIZE_BYTES)
        })}
        className="h-full"
      />
    )
  } else if (!model || !activeSheet) {
    content = null
  } else {
    // Selected cell status: formula cells show the raw formula; values stay in the grid.
    const selectedCellContent = selectedCell?.cell?.formula
      ? `= ${selectedCell.cell.formula}`
      : selectedCell?.cell?.text
    const statusBarText = selectedCell
      ? selectedCellContent
        ? `${selectedCell.address}  ${selectedCellContent}`
        : selectedCell.address
      : null

    content = (
      <div
        data-testid="spreadsheet-file-preview"
        role="region"
        aria-label={fileName}
        className="relative flex h-full w-full flex-col overflow-hidden bg-background">
        <div className="min-h-0 flex-1">
          <XlsxGrid
            // Remount the grid on sheet changes to reset its internal selection state.
            key={activeSheet.name}
            sheet={activeSheet}
            styles={model.styles}
            imageUrls={imageUrls}
            zoom={zoom}
            onSelectCell={setSelectedCell}
            renderChart={renderChart}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-border-subtle border-t bg-background px-2 py-1">
          <Tabs value={activeSheet.name} onValueChange={setActiveSheetName} variant="line" className="min-w-0 shrink">
            <TabsList aria-label={t('xlsx_preview.sheet_tabs_label')} className="min-w-0 gap-1 overflow-x-auto">
              {sheets.map((sheet) => (
                <TabsTrigger key={sheet.name} value={sheet.name} className="shrink-0 px-2 py-1 text-xs">
                  {sheet.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-muted-foreground text-xs">
            {statusBarText ? (
              <span className="selectable cursor-text select-text truncate" data-testid="xlsx-preview-status-bar">
                {statusBarText}
              </span>
            ) : null}
            {selectedCell?.cell?.formulaState === 'unevaluated' ? (
              <span className="shrink-0 italic">{t('xlsx_preview.formula_not_evaluated')}</span>
            ) : null}
          </div>

          <SpreadsheetFilePreviewToolbar
            zoomLabel={formatZoomLabel(zoom)}
            canZoomOut={zoomIndex > 0}
            canZoomIn={zoomIndex >= 0 && zoomIndex < ZOOM_LEVELS.length - 1}
            onZoomOut={zoomOut}
            onZoomIn={zoomIn}
          />
        </div>

        <div aria-hidden className="hidden h-24 shrink-0 [[data-shell-maximized-overlay]_&]:block" />
      </div>
    )
  }

  return (
    <FilePreviewLayout.Frame>
      <FilePreviewLayout.Content>{content}</FilePreviewLayout.Content>
    </FilePreviewLayout.Frame>
  )
}

export default function SpreadsheetFilePreview(props: FilePreviewPluginProps) {
  const extension = getFilePreviewExtension(props.filePath)
  if (extension === 'csv' || extension === 'tsv') return <DelimitedSpreadsheetFilePreview {...props} />
  return <XlsxSpreadsheetFilePreview {...props} />
}
