// Browser-side, best-effort advert video transcoding. Runs only when an admin
// uploads media; customer devices never perform this work.
window.leogoCompressAdvertVideo = async (file, onProgress = () => {}) => {
  if (!file?.type?.startsWith('video/') || file.size < 2 * 1024 * 1024) return file;
  const supported = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/mp4']
    .find((type) => window.MediaRecorder?.isTypeSupported?.(type));
  if (!supported || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Automatic compression is unavailable in this browser. Please upload a compressed MP4 (H.264, 720p, ideally below 5 MB).');
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  video.volume = 1; // Audio routes to the recorder, not the speakers.
  let audioContext;
  let canvasStream;
  let recorder;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Cannot read this video. Use a playable MP4 or WebM.'));
      video.src = url;
    });
    if (!(video.duration > 0 && video.duration <= 60)) throw new Error('Advert videos must be no longer than 60 seconds.');

    const scale = Math.min(1, 960 / video.videoWidth, 540 / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser cannot resize the video.');
    canvasStream = canvas.captureStream(24);
    let destination;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
      destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaElementSource(video).connect(destination);
    }
    if (!destination) throw new Error('Audio-preserving compression is unavailable in this browser.');
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: supported, videoBitsPerSecond: 750000, audioBitsPerSecond: 96000 });
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('Video compression failed. Please retry with a smaller video.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || supported }));
    });
    let frame;
    const paint = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(99, Math.round(video.currentTime / video.duration * 100)));
      if (!video.paused && !video.ended) frame = requestAnimationFrame(paint);
    };
    try {
      await audioContext.resume();
      await video.play();
      recorder.start(1000);
      frame = requestAnimationFrame(paint);
      await Promise.race([
        new Promise((resolve, reject) => {
          video.onended = resolve;
          video.onerror = () => reject(new Error('Video decoding failed during compression.'));
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Video conversion timed out. Try a shorter video.')), 90000); })
      ]);
    } finally {
      cancelAnimationFrame(frame);
      if (recorder.state !== 'inactive') recorder.stop();
    }
    const compressed = await done;
    if (!compressed.size || compressed.size >= file.size) return file;
    const extension = compressed.type.includes('mp4') ? 'mp4' : 'webm';
    return new File([compressed], String(file.name).replace(/\.[^.]+$/, '') + '-optimized.' + extension, { type: compressed.type });
  } finally {
    clearTimeout(timer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvasStream?.getTracks().forEach((track) => track.stop());
    await audioContext?.close().catch(() => {});
    URL.revokeObjectURL(url);
  }
};
