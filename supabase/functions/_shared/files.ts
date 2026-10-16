import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { unzipSync, strFromU8 } from 'npm:fflate@0.8.2';
import { decode as pngDecode } from 'npm:fast-png@6.4.0';
import jpeg from 'npm:jpeg-js@0.4.4';

/** Structural validation, not an antivirus. Parsing is bounded before decompression. */
export async function validateFile(bytes: Uint8Array, mime: string, name: string): Promise<void> {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('El archivo debe pesar entre 1 byte y 10 MB.');
  const extension = name.split('.').at(-1)?.toLowerCase();
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  if (mime === 'application/pdf' && extension === 'pdf') {
    if (!head.startsWith('%PDF-') || !new TextDecoder('latin1').decode(bytes.subarray(-2048)).includes('%%EOF')) throw new Error('PDF incompleto.');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    if (pdf.getPageCount() < 1 || pdf.getPageCount() > 10000) throw new Error('PDF sin páginas o demasiado complejo.');
  } else if (mime === 'image/png' && extension === 'png') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a ||
      view.getUint32(16) * view.getUint32(20) > 16000000) throw new Error('PNG inválido o imagen demasiado grande.');
    pngDecode(bytes, { checkCrc: true });
  } else if (mime === 'image/jpeg' && ['jpg', 'jpeg'].includes(extension ?? '')) {
    jpeg.decode(bytes, { maxResolutionInMP: 16, maxMemoryUsageInMB: 96, tolerantDecoding: false, useTArray: true });
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && extension === 'docx') {
    if (!head.startsWith('PK')) throw new Error('Documento Word inválido.');
    let total = 0, count = 0;
    const entries = unzipSync(bytes, { filter: entry => {
      total += entry.originalSize; count++;
      if (total > 40 * 1024 * 1024 || count > 4000 || /(^|\/)\.\.(\/|$)/.test(entry.name) || /vbaProject|\.exe$/i.test(entry.name)) throw new Error('Documento no admitido.');
      const needed = ['[Content_Types].xml', 'word/document.xml'].includes(entry.name);
      if (needed && entry.originalSize > 4 * 1024 * 1024) throw new Error('Documento demasiado complejo.');
      return needed;
    }});
    const body = entries['word/document.xml']; const types = entries['[Content_Types].xml'];
    if (!body || !types || !strFromU8(body).includes('<w:document') || !strFromU8(types).includes('wordprocessingml.document.main+xml')) throw new Error('No es un DOCX válido.');
  } else if (mime === 'application/msword' && extension === 'doc') {
    const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (bytes.length < 512 || !signature.every((b, i) => bytes[i] === b)) throw new Error('No es un documento DOC válido.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const shift = view.getUint16(30, true);
    if (![9, 12].includes(shift) || view.getUint16(28, true) !== 0xfffe || bytes.length % (1 << shift) !== 0) throw new Error('Estructura DOC incompleta.');
    // Directory entries are fixed 128-byte records. Require the legacy WordDocument stream.
    let found = false;
    for (let offset = 512; offset + 128 <= bytes.length; offset += 128) {
      if (bytes[offset + 66] === 2 && view.getUint16(offset + 64, true) === 26 &&
        new TextDecoder('utf-16le').decode(bytes.subarray(offset, offset + 24)) === 'WordDocument') found = true;
    }
    if (!found) throw new Error('El contenedor no contiene un documento Word.');
  } else throw new Error('La extensión y el contenido no corresponden a un formato admitido.');
}
