import { application } from '@application'
import { notifyDataApiDataChange } from '@data/dataApiDataChange'
import {
  transcriptionPromptTemplateTable,
  transcriptionRecordTable,
  transcriptionResultTable
} from '@data/db/schemas/transcription'
import { loggerService } from '@logger'
import { DataApiErrorFactory } from '@shared/data/api/errors'
import type {
  CreateTranscriptionPromptTemplateDto,
  CreateTranscriptionRecordDto,
  SaveTranscriptionResultDto,
  TranscriptionRecordListResponse,
  TranscriptionRecordQuery,
  UpdateTranscriptionPromptTemplateDto,
  UpdateTranscriptionRecordDto,
  UpdateTranscriptionTextDto
} from '@shared/data/api/schemas/transcription'
import {
  type TranscriptionPromptTemplate,
  TranscriptionPromptTemplateSchema,
  type TranscriptionRecord,
  TranscriptionRecordSchema,
  type TranscriptionResult,
  TranscriptionResultSchema
} from '@shared/data/types/transcription'
import { and, asc, eq, type SQL, sql } from 'drizzle-orm'

import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor'
import { timestampToISO } from './utils/rowMappers'

const logger = loggerService.withContext('DataApi:TranscriptionHistoryService')

const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-general-summary',
    name: 'General Summary',
    orderKey: '0010',
    isDefault: true,
    prompt:
      'Create a concise title, a short summary, key points, and todos from this transcript.\n\nTranscript:\n{{transcript}}\n\nSegments:\n{{segments}}\n\nLanguage: {{language}}\nDuration: {{duration}}'
  },
  {
    id: 'builtin-meeting-minutes',
    name: 'Meeting Minutes',
    orderKey: '0020',
    isDefault: false,
    prompt:
      'Turn this transcript into meeting minutes with agenda, decisions, action items, risks, and follow-ups.\n\nTranscript:\n{{transcript}}\n\nSegments:\n{{segments}}\n\nLanguage: {{language}}\nDuration: {{duration}}'
  },
  {
    id: 'builtin-interview-notes',
    name: 'Interview Notes',
    orderKey: '0030',
    isDefault: false,
    prompt:
      'Organize this transcript as interview notes with a Q&A structure, core opinions, and quotable excerpts.\n\nTranscript:\n{{transcript}}\n\nSegments:\n{{segments}}\n\nLanguage: {{language}}\nDuration: {{duration}}'
  },
  {
    id: 'builtin-article-draft',
    name: 'Article Draft',
    orderKey: '0040',
    isDefault: false,
    prompt:
      'Turn this transcript into an article draft with a title, outline, and polished body.\n\nTranscript:\n{{transcript}}\n\nSegments:\n{{segments}}\n\nLanguage: {{language}}\nDuration: {{duration}}'
  }
] as const

function rowToRecord(row: typeof transcriptionRecordTable.$inferSelect): TranscriptionRecord {
  return TranscriptionRecordSchema.parse({
    ...row,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  })
}

function rowToResult(row: typeof transcriptionResultTable.$inferSelect): TranscriptionResult {
  const { segmentsJson, ...result } = row
  return TranscriptionResultSchema.parse({
    ...result,
    segments: JSON.parse(segmentsJson),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  })
}

function rowToTemplate(row: typeof transcriptionPromptTemplateTable.$inferSelect): TranscriptionPromptTemplate {
  return TranscriptionPromptTemplateSchema.parse({
    ...row,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt)
  })
}

export class TranscriptionHistoryService {
  listRecords(query: TranscriptionRecordQuery): TranscriptionRecordListResponse {
    const db = application.get('DbService').getDb()
    const filters: SQL[] = []
    if (query.status) filters.push(eq(transcriptionRecordTable.status, query.status))
    if (query.search) {
      const pattern = `%${query.search.replace(/[%_\\]/g, '\\$&')}%`
      filters.push(sql`${transcriptionRecordTable.title} LIKE ${pattern} ESCAPE '\\'`)
    }

    const ordering = keysetOrdering(transcriptionRecordTable.createdAt, transcriptionRecordTable.id, {
      major: 'desc',
      tie: 'asc'
    })
    const conditions = [...filters]
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'transcription-record')
    if (cursor) conditions.push(ordering.where(cursor))
    const where = conditions.length > 0 ? and(...conditions) : undefined
    const countWhere = filters.length > 0 ? and(...filters) : undefined
    const rows = db
      .select()
      .from(transcriptionRecordTable)
      .where(where)
      .orderBy(...ordering.orderBy)
      .limit(query.limit + 1)
      .all()
    const [{ count }] = db
      .select({ count: sql<number>`count(*)` })
      .from(transcriptionRecordTable)
      .where(countWhere)
      .all()
    const pageRows = rows.slice(0, query.limit)

    return {
      items: pageRows.map(rowToRecord),
      total: count,
      nextCursor:
        rows.length > query.limit
          ? encodeCursor(pageRows[pageRows.length - 1].createdAt, pageRows[pageRows.length - 1].id)
          : undefined
    }
  }

  getRecord(id: string): { record: TranscriptionRecord; result: TranscriptionResult | null } {
    const db = application.get('DbService').getDb()
    const record = db.select().from(transcriptionRecordTable).where(eq(transcriptionRecordTable.id, id)).get()
    if (!record) throw DataApiErrorFactory.notFound('TranscriptionRecord', id)
    const result = db.select().from(transcriptionResultTable).where(eq(transcriptionResultTable.recordId, id)).get()
    return { record: rowToRecord(record), result: result ? rowToResult(result) : null }
  }

  createRecord(input: CreateTranscriptionRecordDto): TranscriptionRecord {
    const db = application.get('DbService').getDb()
    const row = db
      .insert(transcriptionRecordTable)
      .values({ ...input, status: input.status ?? 'ready' })
      .returning()
      .get()
    if (!row)
      throw DataApiErrorFactory.database(new Error('Insert did not return a row'), 'create transcription record')
    const record = rowToRecord(row)
    notifyDataApiDataChange([{ endpoint: '/transcription/records', kind: 'membership', entityIds: [record.id] }])
    return record
  }

  updateRecord(id: string, input: UpdateTranscriptionRecordDto): TranscriptionRecord {
    const db = application.get('DbService').getDb()
    const row = db
      .update(transcriptionRecordTable)
      .set(input)
      .where(eq(transcriptionRecordTable.id, id))
      .returning()
      .get()
    if (!row) throw DataApiErrorFactory.notFound('TranscriptionRecord', id)
    const record = rowToRecord(row)
    notifyDataApiDataChange([{ endpoint: '/transcription/records', kind: 'membership', entityIds: [id] }])
    return record
  }

  deleteRecord(id: string): void {
    const db = application.get('DbService').getDb()
    const row = db
      .delete(transcriptionRecordTable)
      .where(eq(transcriptionRecordTable.id, id))
      .returning({ id: transcriptionRecordTable.id })
      .get()
    if (!row) throw DataApiErrorFactory.notFound('TranscriptionRecord', id)
    notifyDataApiDataChange([{ endpoint: '/transcription/records', kind: 'membership', entityIds: [id] }])
  }

  saveResult(recordId: string, input: SaveTranscriptionResultDto): TranscriptionResult {
    const result = application.get('DbService').withWriteTx((tx) => {
      const record = tx
        .select({ id: transcriptionRecordTable.id })
        .from(transcriptionRecordTable)
        .where(eq(transcriptionRecordTable.id, recordId))
        .get()
      if (!record) throw DataApiErrorFactory.notFound('TranscriptionRecord', recordId)
      const values = { ...input, segmentsJson: JSON.stringify(input.segments) }
      const current = tx
        .select()
        .from(transcriptionResultTable)
        .where(eq(transcriptionResultTable.recordId, recordId))
        .get()
      const row = current
        ? tx
            .update(transcriptionResultTable)
            .set(values)
            .where(eq(transcriptionResultTable.recordId, recordId))
            .returning()
            .get()
        : tx
            .insert(transcriptionResultTable)
            .values({ recordId, ...values })
            .returning()
            .get()
      if (!row) throw DataApiErrorFactory.database(new Error('Write did not return a row'), 'save transcription result')
      return rowToResult(row)
    })
    notifyDataApiDataChange([
      { endpoint: '/transcription/records/:id', routeParams: { id: recordId }, entityIds: [recordId] }
    ])
    return result
  }

  updateResultText(recordId: string, input: UpdateTranscriptionTextDto): TranscriptionResult {
    const result = application.get('DbService').withWriteTx((tx) => {
      const row = tx
        .update(transcriptionResultTable)
        .set({ transcriptText: input.transcriptText, segmentsJson: JSON.stringify(input.segments) })
        .where(eq(transcriptionResultTable.recordId, recordId))
        .returning()
        .get()
      if (!row) throw DataApiErrorFactory.notFound('TranscriptionResult', recordId)
      return rowToResult(row)
    })
    notifyDataApiDataChange([
      { endpoint: '/transcription/records/:id', routeParams: { id: recordId }, entityIds: [recordId] }
    ])
    return result
  }

  listPromptTemplates(): TranscriptionPromptTemplate[] {
    const db = application.get('DbService').getDb()
    db.insert(transcriptionPromptTemplateTable)
      .values(BUILT_IN_TEMPLATES.map((template) => ({ ...template, builtIn: true })))
      .onConflictDoNothing()
      .run()
    return db
      .select()
      .from(transcriptionPromptTemplateTable)
      .orderBy(asc(transcriptionPromptTemplateTable.orderKey))
      .all()
      .map(rowToTemplate)
  }

  createPromptTemplate(input: CreateTranscriptionPromptTemplateDto): TranscriptionPromptTemplate {
    const db = application.get('DbService').getDb()
    const row = db
      .insert(transcriptionPromptTemplateTable)
      .values({ ...input, builtIn: false, isDefault: input.isDefault ?? false, orderKey: String(Date.now()) })
      .returning()
      .get()
    if (!row)
      throw DataApiErrorFactory.database(
        new Error('Insert did not return a row'),
        'create transcription prompt template'
      )
    const template = rowToTemplate(row)
    notifyDataApiDataChange([
      { endpoint: '/transcription/prompt-templates', kind: 'membership', entityIds: [template.id] }
    ])
    return template
  }

  updatePromptTemplate(id: string, input: UpdateTranscriptionPromptTemplateDto): TranscriptionPromptTemplate {
    const db = application.get('DbService').getDb()
    const row = db
      .update(transcriptionPromptTemplateTable)
      .set(input)
      .where(eq(transcriptionPromptTemplateTable.id, id))
      .returning()
      .get()
    if (!row) throw DataApiErrorFactory.notFound('TranscriptionPromptTemplate', id)
    const template = rowToTemplate(row)
    notifyDataApiDataChange([{ endpoint: '/transcription/prompt-templates', kind: 'membership', entityIds: [id] }])
    return template
  }

  deletePromptTemplate(id: string): void {
    const db = application.get('DbService').getDb()
    const row = db
      .delete(transcriptionPromptTemplateTable)
      .where(eq(transcriptionPromptTemplateTable.id, id))
      .returning({ id: transcriptionPromptTemplateTable.id })
      .get()
    if (!row) throw DataApiErrorFactory.notFound('TranscriptionPromptTemplate', id)
    notifyDataApiDataChange([{ endpoint: '/transcription/prompt-templates', kind: 'membership', entityIds: [id] }])
    logger.info('Deleted transcription prompt template', { id })
  }
}

export const transcriptionHistoryService = new TranscriptionHistoryService()
