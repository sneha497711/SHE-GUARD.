/**
 * js/recorder.js — Evidence Video + Audio Recorder
 * Uses MediaRecorder API (video + mic). Shows live preview, builds download link on stop.
 */

let _mediaRecorder = null;
let _chunks        = [];
let _stream        = null;
let _recordingBlob = null;

function _getSupportedMime() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }
  return '';
}

async function sgStartRecording() {
  if (_mediaRecorder && _mediaRecorder.state === 'recording') return true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    sgLog('MediaRecorder not supported.', 'error');
    return false;
  }

  const recEl = document.getElementById('sosRecText');

  // ── Try video + audio first, fall back to audio-only ──
  let gotVideo = false;
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true,
    });
    gotVideo = true;
    sgLog('Video + audio stream acquired.', 'success');
  } catch (videoErr) {
    sgLog(`Camera unavailable (${videoErr.message}) — falling back to audio only.`, 'warning');
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (audioErr) {
      sgLog(`Recording failed: ${audioErr.message}`, 'error');
      if (recEl) recEl.textContent = 'Recording unavailable';
      return false;
    }
  }

  // ── Show live video preview in SOS overlay ────────────
  const previewEl = document.getElementById('sosVideoPreview');
  if (gotVideo && previewEl) {
    previewEl.srcObject = _stream;
    previewEl.muted     = true;
    previewEl.play().catch(() => {});
    previewEl.classList.remove('hidden');
  }

  _chunks = [];
  const mime = _getSupportedMime();
  _mediaRecorder = new MediaRecorder(_stream, mime ? { mimeType: mime } : {});

  _mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) _chunks.push(e.data);
  };

  _mediaRecorder.onstop = () => {
    if (previewEl) {
      previewEl.srcObject = null;
      previewEl.classList.add('hidden');
    }

    if (_chunks.length === 0) return;

    const type     = mime || (gotVideo ? 'video/webm' : 'audio/webm');
    _recordingBlob = new Blob(_chunks, { type });
    const url      = URL.createObjectURL(_recordingBlob);
    const filename = `sheguard-evidence-${sgTimestamp()}.webm`;
    const label    = gotVideo ? 'Video+Audio' : 'Audio';
    const sizeKB   = (_recordingBlob.size / 1024).toFixed(1);

    // ── AUTO-DOWNLOAD immediately so evidence is never lost on tab close ──
    try {
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      sgLog(`✔ Evidence auto-downloaded: ${filename} (${sizeKB} KB)`, 'success');
    } catch (dlErr) {
      sgLog(`Auto-download failed: ${dlErr.message}`, 'warning');
    }

    // ── Store in Evidence tab ──
    if (typeof sgStoreRecording === 'function') {
      sgStoreRecording(url, filename, sizeKB, label);
    }

    // ── Update SOS overlay with manual download link as backup ──
    if (recEl) {
      recEl.innerHTML =
        `● Evidence saved (${label}, ${sizeKB} KB) — ` +
        `<a href="${url}" download="${filename}" style="color:#ff3e6c;text-decoration:underline">` +
        `Download again</a>`;
    }

    sgLog(`Recording blob ready — ${label}, ${sizeKB} KB.`, 'success');
  };

  _mediaRecorder.start(500);

  const label = gotVideo ? '● Recording video + mic…' : '● Recording audio…';
  sgLog(label, 'success');
  if (recEl) recEl.textContent = label;

  return true;
}

function sgStopRecording() {
  try {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
    }
  } catch (e) { /* already stopped */ }

  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  sgLog('Recording stopped.', 'info');
}

function sgGetRecordingBlob() {
  return _recordingBlob;
}
