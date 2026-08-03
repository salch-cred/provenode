/**
 * Model metadata extractor — api/lib/metadata.js
 * Parses binary model files (ONNX, TFLite, etc.) to extract architecture info.
 */

/** ONNX magic bytes: 0x08 followed by model version field */
const ONNX_MAGIC = 0x08;
const TFLITE_MAGIC = Buffer.from([0x18, 0x00, 0x00, 0x00, 0x47, 0x4F, 0x4F, 0x47]); // TFLite flatbuffer

export function extractMetadata(buffer, filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  const meta = {
    format: 'unknown',
    sizeBytes: buffer.length,
    sizeHuman: formatSize(buffer.length),
    parameterEstimate: null,
    framework: null,
    inputShape: null,
    outputShape: null,
    producerName: null,
    producerVersion: null,
  };

  if (ext === 'onnx' || (buffer[0] === ONNX_MAGIC)) {
    meta.format = 'ONNX';
    meta.framework = 'ONNX Runtime';
    // ONNX protobuf: field 1 (ir_version), field 2 (opset), field 8 (producer_name)
    const producerName = extractProtoString(buffer, 8);
    const producerVersion = extractProtoString(buffer, 9);
    if (producerName) meta.producerName = producerName;
    if (producerVersion) meta.producerVersion = producerVersion;
    meta.parameterEstimate = estimateParams(buffer.length, 'onnx');
  } else if (ext === 'tflite' || buffer.slice(4, 8).toString() === 'GOOG') {
    meta.format = 'TFLite';
    meta.framework = 'TensorFlow Lite';
    meta.parameterEstimate = estimateParams(buffer.length, 'tflite');
  } else if (ext === 'pt' || ext === 'pth') {
    meta.format = 'PyTorch';
    meta.framework = 'PyTorch';
    meta.parameterEstimate = estimateParams(buffer.length, 'pytorch');
  } else if (ext === 'bin' || ext === 'gguf') {
    meta.format = ext === 'gguf' ? 'GGUF' : 'Binary';
    meta.framework = ext === 'gguf' ? 'llama.cpp' : 'Generic';
    if (ext === 'gguf') {
      // GGUF magic: GGUF
      if (buffer.slice(0,4).toString('ascii') === 'GGUF') {
        meta.format = 'GGUF';
        const version = buffer.readUInt32LE(4);
        meta.producerVersion = `GGUF v${version}`;
      }
    }
    meta.parameterEstimate = estimateParams(buffer.length, 'bin');
  } else if (ext === 'json') {
    meta.format = 'JSON (Config/Weights index)';
    meta.framework = 'HuggingFace/Custom';
  }

  // Recommend hardware based on size
  const mb = buffer.length / 1048576;
  if (mb < 5) meta.recommendedHardware = 'MCU / Low-power ARM';
  else if (mb < 50) meta.recommendedHardware = 'ARM Cortex-A / Mobile CPU';
  else if (mb < 300) meta.recommendedHardware = 'Edge GPU / NPU';
  else meta.recommendedHardware = 'Server GPU';

  return meta;
}

function formatSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n/1048576).toFixed(1) + ' MB';
  return (n/1073741824).toFixed(2) + ' GB';
}

function estimateParams(bytes, format) {
  // Rough estimate: most models are FP32 (4 bytes/param) or FP16 (2 bytes/param)
  const fp32params = Math.round(bytes / 4);
  if (fp32params < 1_000_000) return `~${fp32params.toLocaleString()} params`;
  if (fp32params < 1_000_000_000) return `~${(fp32params/1_000_000).toFixed(1)}M params`;
  return `~${(fp32params/1_000_000_000).toFixed(2)}B params`;
}

/** Minimal protobuf string field extractor */
function extractProtoString(buf, fieldNum) {
  try {
    let i = 0;
    while (i < Math.min(buf.length, 2000)) {
      const tag = buf[i];
      const field = tag >> 3;
      const wireType = tag & 0x7;
      i++;
      if (wireType === 2) { // length-delimited
        let len = 0, shift = 0;
        while (buf[i] & 0x80) { len |= (buf[i++] & 0x7f) << shift; shift += 7; }
        len |= buf[i++] << shift;
        if (field === fieldNum && len > 0 && len < 200) {
          return buf.slice(i, i + len).toString('utf8').replace(/[^\x20-\x7E]/g, '');
        }
        i += len;
      } else if (wireType === 0) {
        while (buf[i++] & 0x80 && i < buf.length) {}
      } else break;
    }
  } catch {}
  return null;
}
