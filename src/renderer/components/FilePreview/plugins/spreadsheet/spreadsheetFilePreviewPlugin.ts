import type { FilePreviewPlugin } from '../../types'

export const spreadsheetFilePreviewPlugin = {
  id: 'spreadsheet',
  extensions: ['csv', 'xlsx'],
  load: () => import('./SpreadsheetFilePreview')
} satisfies FilePreviewPlugin
