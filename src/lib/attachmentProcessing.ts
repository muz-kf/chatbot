import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ChatAttachment } from "../types/chat";

const maxFileSize = 12 * 1024 * 1024;
const maxVideoSize = 60 * 1024 * 1024;
const maxExtractedTextLength = 180_000;
const extractedTextSuffix = "\n\n[Extracted text was truncated to fit the upload limit.]";

function limitExtractedText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxExtractedTextLength) return trimmed;
  return `${trimmed.slice(0, maxExtractedTextLength - extractedTextSuffix.length)}${extractedTextSuffix}`;
}

function fileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected file could not be read."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

function dataFromDataUrl(dataUrl: string): string {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("The selected file could not be encoded.");
  return dataUrl.slice(separator + 1);
}

async function extractPdfText(file: File): Promise<string> {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 30); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
  }
  if (document.numPages > 30) {
    pages.push(`[Only the first 30 of ${document.numPages} pages were extracted.]`);
  }
  return limitExtractedText(pages.join("\n\n"));
}

async function extractVideoFrames(file: File): Promise<string[]> {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = sourceUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Could not read video file ${file.name}.`));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error(`Could not determine the duration of ${file.name}.`);
    }

    const frames: string[] = [];
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare video previews.");

    for (const time of [0, video.duration * 0.33, video.duration * 0.66]) {
      if (time > 0) {
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error(`Could not read a frame from ${file.name}.`));
          video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
        });
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(dataFromDataUrl(canvas.toDataURL("image/jpeg", 0.72)));
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function processAttachment(file: File): Promise<ChatAttachment> {
  const lowerName = file.name.toLowerCase();
  const isVideo = file.type.startsWith("video/");
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isSupported =
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    isVideo ||
    isPdf ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type === "text/csv" ||
    file.type === "application/json" ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".docx");

  if (!isSupported) {
    throw new Error(`${file.name} is not a supported file type.`);
  }
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (file.size > (isVideo ? maxVideoSize : maxFileSize)) {
    const limit = isVideo ? "60 MB" : "12 MB";
    throw new Error(`${file.name} exceeds the ${limit} upload limit.`);
  }

  const attachment: ChatAttachment = {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };

  if (file.type.startsWith("image/")) {
    attachment.data = dataFromDataUrl(await fileAsDataUrl(file));
  } else if (file.type.startsWith("audio/")) {
    const wav = await recordedAudioToWav(file);
    attachment.mimeType = "audio/wav";
    attachment.format = "wav";
    attachment.data = dataFromDataUrl(await fileAsDataUrl(wav));
  } else if (isVideo) {
    attachment.frames = await extractVideoFrames(file);
  } else if (isPdf) {
    attachment.text = await extractPdfText(file);
  } else if (lowerName.endsWith(".docx")) {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    attachment.text = limitExtractedText(result.value);
  } else {
    attachment.text = limitExtractedText(await file.text());
  }

  return attachment;
}

export async function recordedAudioToWav(blob: Blob): Promise<Blob> {
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const targetSampleRate = Math.min(buffer.sampleRate, 24_000);
    const sampleRateRatio = buffer.sampleRate / targetSampleRate;
    const sampleCount = Math.ceil(buffer.length / sampleRateRatio);
    const output = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(output);
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, index) => buffer.getChannelData(index),
    );

    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeString(0, "RIFF");
    view.setUint32(4, output.byteLength - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, sampleCount * 2, true);

    let offset = 44;
    for (let outputSample = 0; outputSample < sampleCount; outputSample += 1) {
      const sourcePosition = outputSample * sampleRateRatio;
      const firstIndex = Math.floor(sourcePosition);
      const secondIndex = Math.min(firstIndex + 1, buffer.length - 1);
      const fraction = sourcePosition - firstIndex;
      let value = 0;
      for (const channel of channels) {
        value += channel[firstIndex] * (1 - fraction) + channel[secondIndex] * fraction;
      }
      value = Math.max(-1, Math.min(1, value / channels.length));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
    return new Blob([output], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}
