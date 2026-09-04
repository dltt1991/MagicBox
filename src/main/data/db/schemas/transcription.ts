import type {
  TranscriptionBackend,
  TranscriptionSourceType,
  TranscriptionStatus
} from '@shared/data/types/transcription'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createUpdateTimestamps, uuidPrimaryKeyOrdered } from './_columnHelpers'

export const transcriptionRecordTable = sqliteTable(
  'transcription_record',
  {
    id: uuidPrimaryKeyOrdered(),
    title: text().notNull(),
    sourceType: text().$type<TranscriptionSourceType>().notNull(),
    audioPath: text().notNull(),
    audioManaged: integer({ mode: 'boolean' }).notNull(),
    durationMs: integer(),
    language: text(),
    backend: text().$type<TranscriptionBackend>(),
    providerId: text(),
    modelId: text(),
    status: text().$type<TranscriptionStatus>().notNull().default('ready'),
    errorSummary: text(),
    ...createUpdateTimestamps
  },
  (t) => [
    index('transcription_record_created_at_idx').on(t.createdAt),
    index('transcription_record_status_created_at_idx').on(t.status, t.createdAt)
  ]
)

export const transcriptionResultTable = sqliteTable(
  'transcription_result',
  {
    id: uuidPrimaryKeyOrdered(),
    recordId: text()
      .notNull()
      .references(() => transcriptionRecordTable.id, { onDelete: 'cascade' }),
    transcriptText: text().notNull(),
    segmentsJson: text().notNull(),
    organizationTemplateId: text(),
    organizationPromptSnapshot: text(),
    organizationOutput: text(),
    ...createUpdateTimestamps
  },
  (t) => [uniqueIndex('transcription_result_record_id_idx').on(t.recordId)]
)

export const transcriptionPromptTemplateTable = sqliteTable(
  'transcription_prompt_template',
  {
    id: uuidPrimaryKeyOrdered(),
    name: text().notNull(),
    prompt: text().notNull(),
    builtIn: integer({ mode: 'boolean' }).notNull().default(false),
    isDefault: integer({ mode: 'boolean' }).notNull().default(false),
    orderKey: text().notNull(),
    ...createUpdateTimestamps
  },
  (t) => [index('transcription_prompt_template_order_key_idx').on(t.orderKey)]
)
