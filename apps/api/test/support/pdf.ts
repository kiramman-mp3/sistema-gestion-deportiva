/**
 * Extrae el texto de un PDF generado sin comprimir (en las pruebas `PdfService` desactiva la
 * compresión). pdfkit escribe cada línea como una matriz `[<hex> kerning <hex>…] TJ` en WinAnsi.
 */
export function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const decoder = new TextDecoder('windows-1252');
  const lines: string[] = [];
  for (const match of raw.matchAll(/\[(.*?)\]\s*TJ/gs)) {
    const parts = [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/gi)].map((m) =>
      decoder.decode(Buffer.from(m[1] ?? '', 'hex')),
    );
    lines.push(parts.join(''));
  }
  return lines.join('\n');
}

export const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString('latin1') === '%PDF-';
