import { application } from '@application'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'

import { resolveCustomEndpointConfig } from './customEndpointConfig'
import { CustomEndpointTranscriptionBackend } from './CustomEndpointTranscriptionBackend'
import { LocalWhisperRuntime } from './LocalWhisperRuntime'
import { ProviderTranscriptionBackend } from './ProviderTranscriptionBackend'
import { transcriptionAudioStore } from './TranscriptionAudioStore'
import { TranscriptionOrganizer } from './TranscriptionOrganizer'

type BackendResult = {
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationMs: number | null
  backend: 'local_whisper' | 'provider_model' | 'custom_endpoint'
  providerId?: string
  modelId?: string
}

type TranscriptionCommandInput = {
  jobId: string
  recordId?: string
  audioPath?: string
  recordingId?: string
  sourceType: 'recording' | 'file'
  language: TranscriptionLanguage
  backend: TranscriptionBackendConfig
}

type ResolvedTranscriptionCommandInput = Omit<TranscriptionCommandInput, 'audioPath'> & { audioPath: string }

interface TranscriptionServiceDependencies {
  local: Pick<LocalWhisperRuntime, 'transcribe'>
  provider: Pick<ProviderTranscriptionBackend, 'transcribe'>
  custom: Pick<CustomEndpointTranscriptionBackend, 'transcribe'>
  organizer: Pick<TranscriptionOrganizer, 'organize'>
}

@Injectable('TranscriptionService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['MediaProtocolService'])
export class TranscriptionService extends BaseService {
  private readonly activeJobs = new Map<string, AbortController>()
  private readonly dependencies: TranscriptionServiceDependencies

  constructor(dependencies: Partial<TranscriptionServiceDependencies> = {}) {
    super()
    this.dependencies = {
      local: dependencies.local ?? new LocalWhisperRuntime(),
      provider: dependencies.provider ?? new ProviderTranscriptionBackend(),
      custom: dependencies.custom ?? new CustomEndpointTranscriptionBackend(),
      organizer: dependencies.organizer ?? new TranscriptionOrganizer()
    }
  }

  reserveRecordingTarget(extension: string) {
    return transcriptionAudioStore.reserveRecordingTarget(extension)
  }

  writeRecording(recordingId: string, wavBytes: Uint8Array) {
    return transcriptionAudioStore.writeRecording(recordingId, wavBytes)
  }

  deleteRecording(recordId: string, deleteAudio: boolean): void {
    const { record } = transcriptionHistoryService.getRecord(recordId)
    transcriptionAudioStore.deleteAudio(record, { deleteAudio })
  }

  resolveAudioUrl(recordId: string) {
    const { record } = transcriptionHistoryService.getRecord(recordId)
    return transcriptionAudioStore.resolveAudioUrl(record)
  }

  resolveTemporaryAudioUrl(audioPath: string) {
    return transcriptionAudioStore.resolveTemporaryAudioUrl(audioPath)
  }

  resolveTemporaryRecordingUrl(recordingId: string) {
    return transcriptionAudioStore.resolveTemporaryRecordingUrl(recordingId)
  }

  releaseTemporaryAudioUrl(previewId: string): void {
    transcriptionAudioStore.releaseTemporaryAudioUrl(previewId)
  }

  async transcribe(input: TranscriptionCommandInput, senderId: string) {
    const controller = this.startJob(input.jobId)
    try {
      this.sendProgress(senderId, input.jobId, 'preparing')
      const audioPath = this.resolveInputAudioPath(input)
      const output = await this.runBackend({ ...input, audioPath }, controller.signal, senderId)
      controller.signal.throwIfAborted()
      const record = this.saveTranscription({ ...input, audioPath }, output)
      const result = transcriptionHistoryService.saveResult(record.id, {
        transcriptText: output.text,
        segments: output.segments,
        organizationTemplateId: null,
        organizationPromptSnapshot: null,
        organizationOutput: null
      })
      this.sendProgress(senderId, input.jobId, 'completed', { recordId: record.id, percent: 100 })
      return { record, result }
    } catch (error) {
      const stage = controller.signal.aborted ? 'canceled' : 'failed'
      this.sendProgress(senderId, input.jobId, stage)
      if (input.recordId) {
        transcriptionHistoryService.updateRecord(input.recordId, {
          status: stage,
          errorSummary: stage === 'failed' ? 'Transcription failed' : null
        })
      }
      throw error
    } finally {
      this.activeJobs.delete(input.jobId)
    }
  }

  cancel(jobId: string): void {
    this.activeJobs.get(jobId)?.abort()
  }

  async organize(
    input: { jobId: string; recordId: string; templateId: string | null; prompt: string; modelId?: string },
    senderId: string
  ) {
    const controller = this.startJob(input.jobId)
    try {
      this.sendProgress(senderId, input.jobId, 'organizing')
      const { record, result } = transcriptionHistoryService.getRecord(input.recordId)
      if (!result) throw new Error('Transcript is not available for organization')
      await this.dependencies.organizer.organize({
        recordId: record.id,
        transcriptText: result.transcriptText,
        segments: result.segments,
        language: record.language ?? 'auto',
        durationMs: record.durationMs ?? 0,
        templateId: input.templateId,
        prompt: input.prompt,
        modelId: input.modelId,
        signal: controller.signal
      })
      controller.signal.throwIfAborted()
      const updated = transcriptionHistoryService.getRecord(record.id).result
      if (!updated) throw new Error('Organization result was not saved')
      this.sendProgress(senderId, input.jobId, 'completed', { recordId: record.id, percent: 100 })
      return { result: updated }
    } catch (error) {
      this.sendProgress(senderId, input.jobId, controller.signal.aborted ? 'canceled' : 'failed')
      throw error
    } finally {
      this.activeJobs.delete(input.jobId)
    }
  }

  protected override async onStop(): Promise<void> {
    for (const controller of this.activeJobs.values()) controller.abort()
    this.activeJobs.clear()
  }

  private startJob(jobId: string): AbortController {
    if (this.activeJobs.has(jobId)) throw new Error('Transcription job is already active')
    const controller = new AbortController()
    this.activeJobs.set(jobId, controller)
    return controller
  }

  private async runBackend(
    input: ResolvedTranscriptionCommandInput,
    signal: AbortSignal,
    senderId: string
  ): Promise<BackendResult> {
    if (input.backend.backend === 'local_whisper') {
      this.sendProgress(senderId, input.jobId, 'loading_model')
      this.sendProgress(senderId, input.jobId, 'transcribing')
      return await this.dependencies.local.transcribe(input.audioPath, input.language, signal)
    }
    this.sendProgress(senderId, input.jobId, 'transcribing')
    if (input.backend.backend === 'provider_model') {
      return await this.dependencies.provider.transcribe({
        ...input.backend,
        audioPath: input.audioPath,
        language: input.language,
        signal
      })
    }
    const config = resolveCustomEndpointConfig(input.backend)
    return await this.dependencies.custom.transcribe({
      audioPath: input.audioPath,
      language: input.language,
      config,
      signal
    })
  }

  private saveTranscription(input: ResolvedTranscriptionCommandInput, output: BackendResult) {
    const values = {
      durationMs: output.durationMs,
      language: output.language ?? null,
      backend: output.backend,
      providerId: output.providerId ?? null,
      modelId: output.modelId ?? null,
      status: 'ready' as const,
      errorSummary: null
    }
    if (input.recordId) return transcriptionHistoryService.updateRecord(input.recordId, values)
    return transcriptionHistoryService.createRecord({
      title:
        input.audioPath
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'Transcription',
      sourceType: input.sourceType,
      audioPath: input.audioPath,
      audioManaged: input.sourceType === 'recording',
      ...values
    })
  }

  private resolveInputAudioPath(input: TranscriptionCommandInput): string {
    if (input.recordingId) return transcriptionAudioStore.getRecordingPath(input.recordingId)
    if (input.audioPath) return input.audioPath
    if (input.recordId) return transcriptionHistoryService.getRecord(input.recordId).record.audioPath
    throw new Error('Audio source is not available')
  }

  private sendProgress(
    senderId: string,
    jobId: string,
    stage: 'preparing' | 'loading_model' | 'transcribing' | 'organizing' | 'completed' | 'failed' | 'canceled',
    extra: { percent?: number; recordId?: string } = {}
  ): void {
    application.get('IpcApiService').send(senderId, 'transcription.progress', { jobId, stage, ...extra })
  }
}
