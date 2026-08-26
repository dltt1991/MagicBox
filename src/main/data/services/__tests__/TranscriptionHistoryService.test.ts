import { transcriptionRecordTable, transcriptionResultTable } from '@data/db/schemas/transcription'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { setupTestDatabase } from '@test-helpers/db'
import { describe, expect, it } from 'vitest'

describe('TranscriptionHistoryService', () => {
  const dbh = setupTestDatabase()

  const createInput = {
    title: 'Planning call',
    sourceType: 'file' as const,
    audioPath: '/tmp/planning.m4a',
    audioManaged: false
  }

  it('creates, lists, gets, updates, and deletes a record without audio bytes', () => {
    const created = transcriptionHistoryService.createRecord(createInput)

    expect(created).toMatchObject({ ...createInput, status: 'ready', durationMs: null })
    expect(Object.keys(created)).not.toContain('audioBytes')
    expect(transcriptionHistoryService.listRecords({ limit: 20 })).toMatchObject({ items: [created], total: 1 })
    expect(transcriptionHistoryService.getRecord(created.id)).toMatchObject({ record: created, result: null })

    const updated = transcriptionHistoryService.updateRecord(created.id, { status: 'failed', errorSummary: 'network' })
    expect(updated).toMatchObject({ id: created.id, status: 'failed', errorSummary: 'network' })

    transcriptionHistoryService.deleteRecord(created.id)
    expect(transcriptionHistoryService.listRecords({ limit: 20 })).toMatchObject({ items: [], total: 0 })
    expect(dbh.db.select().from(transcriptionRecordTable).all()).toEqual([])
  })

  it('preserves edited transcript text and segments when saving a new organization result', () => {
    const record = transcriptionHistoryService.createRecord(createInput)

    const first = transcriptionHistoryService.saveResult(record.id, {
      transcriptText: 'First draft',
      segments: [{ startMs: 0, endMs: 1000, text: 'First draft' }]
    })
    transcriptionHistoryService.updateResultText(record.id, {
      transcriptText: 'Edited draft',
      segments: [{ startMs: 0, endMs: 1500, text: 'Edited draft' }]
    })
    const reorganized = transcriptionHistoryService.saveResult(record.id, {
      transcriptText: 'Stale draft',
      segments: [{ startMs: 0, endMs: 1000, text: 'Stale draft' }],
      organizationTemplateId: 'builtin-general-summary',
      organizationPromptSnapshot: 'Current organization prompt',
      organizationOutput: 'Summary'
    })

    expect(reorganized).toMatchObject({
      id: first.id,
      recordId: record.id,
      transcriptText: 'Edited draft',
      segments: [{ startMs: 0, endMs: 1500, text: 'Edited draft' }],
      organizationTemplateId: 'builtin-general-summary',
      organizationPromptSnapshot: 'Current organization prompt',
      organizationOutput: 'Summary'
    })
    expect(dbh.db.select().from(transcriptionResultTable).all()).toHaveLength(1)
    expect(transcriptionHistoryService.getRecord(record.id).result).toMatchObject({
      id: first.id,
      transcriptText: 'Edited draft',
      segments: [{ startMs: 0, endMs: 1500, text: 'Edited draft' }]
    })
  })

  it('seeds built-in templates while preserving custom templates', () => {
    const custom = transcriptionHistoryService.createPromptTemplate({
      name: 'Custom',
      prompt: 'Write a custom summary.'
    })
    const templates = transcriptionHistoryService.listPromptTemplates()

    expect(templates.map((template) => template.id)).toEqual([
      'builtin-general-summary',
      'builtin-meeting-minutes',
      'builtin-interview-notes',
      'builtin-article-draft',
      custom.id
    ])
    expect(templates.filter((template) => template.builtIn)).toMatchObject([
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
    ])
    expect(templates.find((template) => template.id === custom.id)).toMatchObject({
      builtIn: false,
      prompt: 'Write a custom summary.'
    })
  })
})
