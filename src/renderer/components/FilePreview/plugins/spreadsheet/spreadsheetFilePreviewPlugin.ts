import type { FilePreviewPlugin } from '../../types'

export const spreadsheetFilePreviewPlugin = {
  id: 'spreadsheet',
  extensions: ['csv', 'tsv', 'xlsx'],
  load: () => import('./SpreadsheetFilePreview'),
  supportsSelectionReference: true
} satisfies FilePreviewPlugin
