import { application } from '@application'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'

import { resolveCustomEndpointConfig } from './customEndpointConfig'
import { CustomEndpointTranscriptionBackend } from './CustomEndpointTranscriptionBackend'
import { type LocalWhisperRuntime, whisperInferenceRuntime } from './LocalWhisperRuntime'
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
  local: Pick<LocalWhisperRuntime, 'transcribe'> & Partial<Pick<LocalWhisperRuntime, 'unload'>>
  provider: Pick<ProviderTranscriptionBackend, 'transcribe'>
  custom: Pick<CustomEndpointTranscriptionBackend, 'transcribe'>
  organizer: Pick<TranscriptionOrganizer, 'organize'>
}

@Injectable('TranscriptionService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['MediaProtocolService'])
export class TranscriptionService extends BaseService {
  private readonly activeJobs = new Map<string, AbortController>()
  private readonly localJobs = new Set<string>()
  private readonly dependencies: TranscriptionServiceDependencies

  constructor(dependencies: Partial<TranscriptionServiceDependencies> = {}) {
    super()
    this.dependencies = {
      local: dependencies.local ?? whisperInferenceRuntime,
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

  discardRecording(recordingId: string): void {
    transcriptionAudioStore.discardRecording(recordingId)
  }

  deleteRecording(recordId: string, deleteAudio: boolean): void {
    const { record } = transcriptionHistoryService.getRecord(recordId)
    transcriptionHistoryService.deleteRecord(recordId)
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

  releaseAudioUrl(playbackId: string): void {
    transcriptionAudioStore.releaseAudioUrl(playbackId)
  }

  async transcribe(input: TranscriptionCommandInput, senderId: string) {
    const controller = this.startJob(input.jobId)
    let claimedRecordingId: string | null = null
    try {
      this.sendProgress(senderId, input.jobId, 'preparing')
      const audioPath = this.resolveInputAudioPath(input)
      claimedRecordingId = input.recordingId ?? null
      const output = await this.runBackend({ ...input, audioPath }, controller.signal, senderId)
      controller.signal.throwIfAborted()
      const saved = this.saveTranscription({ ...input, audioPath }, output, {
        transcriptText: output.text,
        segments: output.segments,
        organizationTemplateId: null,
        organizationPromptSnapshot: null,
        organizationOutput: null
      })
      if (input.recordingId) transcriptionAudioStore.adoptRecording(input.recordingId)
      claimedRecordingId = null
      this.sendProgress(senderId, input.jobId, 'completed', { recordId: saved.record.id, percent: 100 })
      return saved
    } catch (error) {
      const stage = controller.signal.aborted ? 'canceled' : 'failed'
      this.sendProgress(senderId, input.jobId, stage)
      if (input.recordId) {
        transcriptionHistoryService.updateRecord(input.recordId, {
          status: stage,
          errorSummary: stage === 'failed' ? 'Transcription failed' : null
        })
      }
      if (claimedRecordingId) transcriptionAudioStore.releaseClaimedRecording(claimedRecordingId)
      throw error
    } finally {
      this.activeJobs.delete(input.jobId)
      this.localJobs.delete(input.jobId)
    }
  }

  cancel(jobId: string): void {
    const controller = this.activeJobs.get(jobId)
    controller?.abort()
    if (controller && this.localJobs.has(jobId)) {
      const unloading = this.dependencies.local.unload?.()
      if (unloading) void unloading.catch(() => undefined)
    }
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
    this.localJobs.clear()
    await this.dependencies.local.unload?.()
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
      this.localJobs.add(input.jobId)
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

  private saveTranscription(
    input: ResolvedTranscriptionCommandInput,
    output: BackendResult,
    resultInput: Parameters<typeof transcriptionHistoryService.saveResult>[1]
  ) {
    const values = {
      durationMs: output.durationMs,
      language: output.language ?? null,
      backend: output.backend,
      providerId: output.providerId ?? null,
      modelId: output.modelId ?? null,
      status: 'ready' as const,
      errorSummary: null
    }
    if (input.recordId) {
      const record = transcriptionHistoryService.updateRecord(input.recordId, values)
      const result = transcriptionHistoryService.saveResult(record.id, resultInput)
      return { record, result }
    }
    return transcriptionHistoryService.createRecordWithResult(
      {
        title:
          input.audioPath
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^.]+$/, '') || 'Transcription',
        sourceType: input.sourceType,
        audioPath: input.audioPath,
        audioManaged: input.sourceType === 'recording',
        ...values
      },
      resultInput
    )
  }

  private resolveInputAudioPath(input: TranscriptionCommandInput): string {
    if (input.recordingId) return transcriptionAudioStore.claimRecording(input.recordingId)
    if (input.recordId) return transcriptionHistoryService.getRecord(input.recordId).record.audioPath
    if (input.audioPath) return input.audioPath
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
