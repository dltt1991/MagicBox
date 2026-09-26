import { LOCAL_MODEL_BUNDLE_BY_CAPABILITY, type LocalModelBundleId } from '@shared/data/presets/localModel'

import type { ModelBundle, SharedArtifact, SharedArtifactId } from './types'

/**
 * Single source of truth for everything installable locally: which bundles exist,
 * what files they are made of, where those bytes come from and what they must hash
 * to. Data only — fetching lives in `../acquisition`, on-disk state in
 * `../installation/LocalModelStorageService`, mirror resolution in `../acquisition/modelSource`.
 *
 * Adding a model means adding an entry here; nothing else in the subsystem is
 * per-model. See `docs/references/ai/local-models.md` for the checklist.
 *
 * ## Obtaining `sha256`
 * Both mirrors publish the digest, so no download is needed:
 *   - HuggingFace: `GET /api/models/<repo>/tree/main?recursive=true` → `lfs.oid`
 *     (LFS files only — small files report a git blob SHA-1 instead).
 *   - ModelScope: `GET /api/v1/models/<repo>/repo/files?Revision=master` → `Sha256`.
 * Every file below was confirmed byte-identical across both mirrors, which is what
 * lets one digest serve a download that may fall back between them.
 */

export const SHARED_ARTIFACTS = {
  /** Native onnxruntime binding, downloaded on demand rather than bundled: the npm
   * package carries every platform's binaries, so shipping it would add hundreds of
   * MB to an installer for users who never touch a local model. `dist/binding.js` is
   * patched (patches/onnxruntime-node@1.25.1.patch) to load the copy fetched here via
   * `CHERRY_ONNXRUNTIME_BINDING_PATH`. `version` must match package.json's pin. */
  'onnxruntime-node': {
    id: 'onnxruntime-node',
    packageName: 'onnxruntime-node',
    version: '1.25.1',
    tarballSha256: '582c44aac00414a5580fe9dcbebcb12c8bf1cc703ab3507203455db842e168f9',
    installDirKey: 'feature.onnxruntime.binary',
    // No darwin-x64: onnxruntime-node ships no binding for it, so both bundles read
    // as `unsupported` on Intel Macs instead of offering a download that cannot work.
    platforms: {
      'darwin-arm64': {
        tarballPrefix: 'package/bin/napi-v6/darwin/arm64/',
        installSubdir: 'napi-v6/darwin/arm64',
        entryFile: 'onnxruntime_binding.node',
        supportFiles: ['libonnxruntime.1.25.1.dylib']
      },
      'linux-x64': {
        tarballPrefix: 'package/bin/napi-v6/linux/x64/',
        installSubdir: 'napi-v6/linux/x64',
        entryFile: 'onnxruntime_binding.node',
        supportFiles: ['libonnxruntime.so.1']
      },
      'linux-arm64': {
        tarballPrefix: 'package/bin/napi-v6/linux/arm64/',
        installSubdir: 'napi-v6/linux/arm64',
        entryFile: 'onnxruntime_binding.node',
        supportFiles: ['libonnxruntime.so.1']
      },
      'win32-x64': {
        tarballPrefix: 'package/bin/napi-v6/win32/x64/',
        installSubdir: 'napi-v6/win32/x64',
        entryFile: 'onnxruntime_binding.node',
        supportFiles: ['onnxruntime.dll', 'DirectML.dll', 'dxil.dll', 'dxcompiler.dll']
      },
      'win32-arm64': {
        tarballPrefix: 'package/bin/napi-v6/win32/arm64/',
        installSubdir: 'napi-v6/win32/arm64',
        entryFile: 'onnxruntime_binding.node',
        supportFiles: ['onnxruntime.dll', 'DirectML.dll', 'dxil.dll', 'dxcompiler.dll']
      }
    }
  }
} as const satisfies Record<SharedArtifactId, SharedArtifact>

export const LOCAL_MODEL_BUNDLES = {
  /** Text embedding for the knowledge base. The four files are what transformers.js
   * needs to load the q8 weights offline; the repo's other quantizations are not fetched. */
  'qwen3-embedding-0.6b': {
    id: 'qwen3-embedding-0.6b',
    capability: 'embedding',
    installDirKey: 'feature.embedding.models',
    // transformers.js loads a model from the directory holding its config.json, and
    // earlier releases let it name that directory after the repo. Keeping the same layout
    // is what lets existing installs upgrade without re-fetching 614MB.
    installSubdir: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    // ModelScope downloads used to nest one more level, because transformers.js appends
    // any revision that is not `main`.
    legacyInstallSubdir: 'onnx-community/Qwen3-Embedding-0.6B-ONNX/master',
    requires: ['onnxruntime-node'],
    runtime: { dtype: 'q8' },
    files: [
      {
        key: 'config',
        relPath: 'config.json',
        repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        remoteFile: 'config.json',
        sha256: '66a10929782f3c9a3cd5dec90e2a95c60e05736134a63cd54479eeae80bed175',
        minBytes: 500,
        weight: 1
      },
      {
        key: 'tokenizerConfig',
        relPath: 'tokenizer_config.json',
        repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        remoteFile: 'tokenizer_config.json',
        sha256: '977648852447cb6587327ff3205b0a84cf2fc9f05621d6c8e88a497caafab2e1',
        minBytes: 1_000,
        weight: 1
      },
      {
        key: 'tokenizer',
        relPath: 'tokenizer.json',
        repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        remoteFile: 'tokenizer.json',
        sha256: 'def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a',
        minBytes: 1_000_000,
        weight: 11
      },
      {
        key: 'weights',
        // Nested under `onnx/` because transformers.js resolves a model's weights
        // relative to the directory holding config.json.
        relPath: 'onnx/model_quantized.onnx',
        repo: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
        remoteFile: 'onnx/model_quantized.onnx',
        sha256: '87cd124e0ef1fd1f223ebc283efccbaeac386d0b08344701c46975d0657b591f',
        minBytes: 100_000_000,
        weight: 585
      }
    ]
  },
  /** PaddleOCR PP-OCRv6 medium — detection + recognition weights plus the character
   * dictionary parsed out of the recognition model's config. */
  'pp-ocrv6-medium': {
    id: 'pp-ocrv6-medium',
    capability: 'ocr',
    installDirKey: 'feature.ocr.paddleocr',
    requires: ['onnxruntime-node'],
    files: [
      {
        key: 'detection',
        relPath: 'PP-OCRv6_medium_det.onnx',
        repo: 'PaddlePaddle/PP-OCRv6_medium_det_onnx',
        remoteFile: 'inference.onnx',
        sha256: 'eb13b44b25bb36f89528b68720af8a61d9cf381176107f465db1757b65d086e1',
        minBytes: 1_000_000,
        weight: 59
      },
      {
        key: 'recognition',
        relPath: 'PP-OCRv6_medium_rec.onnx',
        repo: 'PaddlePaddle/PP-OCRv6_medium_rec_onnx',
        remoteFile: 'inference.onnx',
        sha256: '9c09abf0957f7968c7586464b7397b84ad2387a0497a351af40e9acc71b673ba',
        minBytes: 1_000_000,
        weight: 73
      },
      {
        // The `*_onnx` repos publish no standalone dictionary — it is embedded in the
        // recognition model's `inference.yml` under `PostProcess.character_dict`, so
        // the fetched config is parsed into the ~75KB file ppu-paddle-ocr reads.
        key: 'dictionary',
        relPath: 'ppocrv6_dict.txt',
        repo: 'PaddlePaddle/PP-OCRv6_medium_rec_onnx',
        remoteFile: 'inference.yml',
        sha256: '991b700facf5b50a7de193468207d5f4255b538dde0d312ae3b7c7a9b6873129',
        minBytes: 10_000,
        weight: 1,
        derivation: 'paddle_dict_from_inference_yml'
      }
    ]
  },
  /** Whisper small, quantized for offline speech recognition. */
  whisper: {
    id: 'whisper',
    capability: 'whisper',
    installDirKey: 'feature.transcription.whisper',
    requires: ['onnxruntime-node'],
    runtime: { dtype: 'q8' },
    files: [
      {
        key: 'config',
        relPath: 'config.json',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'config.json',
        sha256: '457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18',
        minBytes: 100,
        weight: 1
      },
      {
        key: 'preprocessorConfig',
        relPath: 'preprocessor_config.json',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'preprocessor_config.json',
        sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
        minBytes: 100,
        weight: 1
      },
      {
        key: 'generationConfig',
        relPath: 'generation_config.json',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'generation_config.json',
        sha256: 'f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0',
        minBytes: 100,
        weight: 1
      },
      {
        key: 'tokenizerConfig',
        relPath: 'tokenizer_config.json',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'tokenizer_config.json',
        sha256: '2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce',
        minBytes: 10_000,
        weight: 1
      },
      {
        key: 'tokenizer',
        relPath: 'tokenizer.json',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'tokenizer.json',
        sha256: '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566',
        minBytes: 1_000_000,
        weight: 2
      },
      {
        key: 'encoder',
        relPath: 'onnx/encoder_model_quantized.onnx',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'onnx/encoder_model_quantized.onnx',
        sha256: 'a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92',
        minBytes: 1_000_000,
        weight: 92
      },
      {
        key: 'decoder',
        relPath: 'onnx/decoder_model_merged_quantized.onnx',
        repo: 'onnx-community/whisper-small',
        remoteFile: 'onnx/decoder_model_merged_quantized.onnx',
        sha256: 'ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9',
        minBytes: 1_000_000,
        weight: 157
      }
    ]
  }
} as const satisfies Record<LocalModelBundleId, ModelBundle>

export const ALL_MODEL_BUNDLE_IDS = Object.keys(LOCAL_MODEL_BUNDLES) as readonly LocalModelBundleId[]

export function getModelBundle(id: LocalModelBundleId): ModelBundle {
  return LOCAL_MODEL_BUNDLES[id]
}

export function getSharedArtifact(id: SharedArtifactId): SharedArtifact {
  return SHARED_ARTIFACTS[id]
}

/** The one bundle serving a capability. Throws rather than returning undefined:
 * a capability with no bundle is a catalog bug, not a runtime condition. */
export function bundleForCapability(capability: ModelBundle['capability']): ModelBundle {
  return getModelBundle(LOCAL_MODEL_BUNDLE_BY_CAPABILITY[capability])
}

/** The transformers.js quantization selector for a bundle's weights. Throws when the
 * bundle declares none, which for a bundle loaded through transformers.js is a catalog
 * bug — the alternative is silently loading a different quantization than was downloaded. */
export function bundleDtype(bundle: ModelBundle): string {
  const dtype = bundle.runtime?.dtype
  if (!dtype) throw new Error(`bundle "${bundle.id}" declares no runtime dtype`)
  return dtype
}

/** One file of a bundle by its stable {@link BundleFile.key}. Throws on an unknown key
 * so a renamed file surfaces at the call site instead of as a silent `undefined` path. */
export function bundleFile(bundle: ModelBundle, key: string): ModelBundle['files'][number] {
  const file = bundle.files.find((entry) => entry.key === key)
  if (!file) throw new Error(`bundle "${bundle.id}" has no file with key "${key}"`)
  return file
}
