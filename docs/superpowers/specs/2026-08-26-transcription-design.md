# Recording Transcription And Auto-Organization Design

## Status

Approved product design. Implementation plan pending.

## Goal

Add a transcription workspace that supports recording audio inside the app, importing existing audio files, transcribing them with either a local Whisper model or an online transcription service, and organizing the transcript with built-in or user-defined prompts.

The first version must:

- Add a left-sidebar entry below Translate.
- Support record-then-transcribe and file-import transcription.
- Support a downloadable local Whisper model through the existing local-model pattern.
- Prefer existing provider transcription models, while also allowing a transcription-specific custom endpoint.
- Save transcription history without storing audio blobs in SQLite.
- Save app-created recordings in an application-managed directory and support playback from history.
- Preserve transcript segments with timestamps and allow clicking a segment to seek audio playback.
- Offer built-in organization templates plus user custom prompts.

Real-time streaming transcription, speaker diarization, batch queues, and multi-version organization history are out of scope for the first version.

## UI Information Architecture

Create a new route at `/app/transcription`. Register it as a sidebar app, place it directly after `translate` in the default sidebar favorites, and add matching route title, tab icon, sidebar label, and locale keys.

The page opens as a working surface, not an empty landing page.

Top toolbar:

- Input source: Recording or Import File.
- Transcription backend: Local Whisper, Provider Model, or Custom Endpoint.
- Language: Auto or an explicit language.
- Local model status: not downloaded, downloading, ready, unsupported, CPU fallback, or accelerated.

Audio area:

- Recording mode: start, pause/resume, stop, then save to the app-managed recordings directory.
- File mode: drag-and-drop or file picker.
- Playback after recording/import, with normal audio controls.
- Segment clicks seek the player to the segment start time.

Transcript area:

- Full transcript with timestamped segments.
- Editable text for correction.
- Copy and export actions.

Organization area:

- Template selector: General Summary, Meeting Minutes, Interview Notes, Article Draft, and custom prompts.
- Organize action, retry, copy, and export.
- The organization result is tied to the selected transcript.

History:

- A collapsible page-local right sidebar, not a new global sidebar hierarchy.
- Items show title, source type, duration, backend/model, and created time.
- Opening an item restores audio playback when the audio reference still exists, transcript segments, and the latest organization result.
- If an external file is missing, text remains available and playback is disabled.

## Transcription Architecture

Add a main-process `TranscriptionService` that owns transcription execution. Renderer code calls IpcApi routes and never directly reads model files or calls transcription API keys.

IpcApi surface:

- `transcription.recording.create`: reserve/create a managed recording file target.
- `transcription.transcribe`: transcribe a recording or imported file.
- `transcription.cancel`: cancel the active transcription.
- `transcription.organize`: run a selected organization prompt against a transcript.
- `transcription.progress`: main-to-renderer event for preparation, model loading, transcription, and organization progress.

The service returns a unified result shape for every backend:

- `text`
- `segments: { startMs, endMs, text }[]`
- `language`
- `backend`
- `providerId` / `modelId`
- `durationMs`
- `elapsedMs`
- optional backend metadata

### Local Whisper

Use the Transformers/ONNX route rather than `whisper.cpp`.

Extend the local downloadable model system with a `whisper` model kind. The user experience should match existing local model cards:

- status query
- download
- cancel
- remove
- progress event
- unsupported status

Store model files through centralized paths, for example under a `feature.transcription.whisper` namespace. Do not use ad hoc user-data paths.

Hardware acceleration uses the existing `feature.local_model.hardware_acceleration.enabled` preference. If acceleration is supported, the local runtime uses it. If it is unavailable, the service falls back to CPU and reports that mode to the UI. If the platform cannot run the model at all, the UI shows unsupported.

Audio preprocessing belongs to main. The renderer passes a file reference; the service normalizes audio into the format required by the local runtime.

### Online Transcription

There are two online paths:

- Existing provider/model system: pick a transcription-capable model from configured providers.
- Custom transcription endpoint: store a transcription-specific endpoint with minimal fields such as base URL, API key, model, and request format.

Custom endpoints do not automatically become general chat providers. They are scoped to transcription unless a later feature explicitly promotes them.

API keys and request bodies must not be logged. Errors should be summarized with provider/model context and redacted details.

## Data And Audio Storage

Use SQLite-backed DataApi because transcription history and custom prompts are durable business data.

Proposed tables:

- `transcription_record`
  - title
  - source type: recording or file
  - audio reference/path
  - duration
  - language
  - backend/provider/model
  - status
  - created/updated timestamps
- `transcription_result`
  - record id
  - transcript text
  - segments JSON
  - organization template id
  - organization prompt snapshot
  - organization output
  - error summary
- `transcription_prompt_template`
  - name
  - prompt
  - built-in/custom flag
  - default flag or order key

The first version keeps one latest result per record. Re-organizing overwrites the organization output and prompt snapshot, but never changes the transcript text unless the user edits it.

Audio storage rules:

- App-created recordings are saved in an application-managed recordings directory and referenced from history.
- Imported files are not copied. History stores the original absolute path plus metadata.
- SQLite never stores audio blobs.
- Deleting a history record deletes only database rows by default.
- For app-managed recordings, deletion should offer to also delete the audio file.
- Imported external files are never deleted by the app.

Playback should use the app's safe file/media access path rather than exposing arbitrary filesystem paths directly to the renderer.

## Organization Templates

Built-in templates:

- General Summary: title, summary, key points, todos.
- Meeting Minutes: agenda, decisions, action items, risks, follow-ups.
- Interview Notes: Q&A structure, core opinions, quotable excerpts.
- Article Draft: title, outline, polished draft body.

Custom prompts are user-created durable records. They support these variables:

- `{{transcript}}`
- `{{segments}}`
- `{{language}}`
- `{{duration}}`

Organization uses a normal LLM provider/model, not necessarily the transcription provider. The page may default to the current chat model and let the user choose another model.

Each organization run saves the prompt snapshot used for the result, so history remains explainable after a template changes.

## Error Handling

Show actionable states:

- Local model not downloaded: show download action and progress.
- Local model unsupported: explain that local transcription is unavailable on this platform.
- Hardware acceleration unavailable: show CPU fallback rather than failing the task.
- Audio import/preprocessing failure: keep the page state and ask the user to choose another file.
- Online provider failure: show provider/model context with redacted error text.
- Missing external audio file: keep transcript/history available and disable playback.
- Organization failure: keep transcript intact and allow retry with another model/template.

Canceling transcription should leave a clear canceled state and avoid persisting partial results as successful history.

## Verification Strategy

Shared tests:

- IPC schema validation for transcription commands/events.
- DataApi DTO validation for records, segments, and templates.
- Template variable rendering.

Main-process tests:

- Local Whisper model status/download dispatch.
- Backend selection between local, provider, and custom endpoint.
- Audio path policy for app recordings versus imported files.
- Cancellation behavior.
- History persistence without audio blobs.

Renderer tests:

- Sidebar default order places Transcription below Translate.
- Route title/icon/label are wired.
- Recording and file modes switch correctly.
- History restores transcript and disables playback for missing external files.
- Template selection and custom prompt creation flow.

Integration-level test:

- Mock transcription backend returns timestamped segments.
- Renderer or service organizes the transcript with a mock LLM response.
- History persists and reloads the transcript plus organization result.

Manual verification:

- Record audio, transcribe, play back, click segments to seek.
- Import a file, transcribe, organize, and reopen from history.
- Download local Whisper model and observe status/progress.
- Use provider transcription and custom endpoint transcription.
- Delete a history record for an app recording and verify the optional file cleanup behavior.
