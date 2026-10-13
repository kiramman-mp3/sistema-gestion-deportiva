/**
 * Exportación CSV pensada para Excel en español: separador `;`, saltos CRLF y BOM UTF-8
 * (sin el BOM, Excel rompe las tildes). Las celdas que empiezan por `=`, `+`, `-`, `@` o
 * tabulación se prefijan con una comilla para impedir la inyección de fórmulas.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): Buffer {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [headers, ...rows].map((row) => row.map(cell).join(';'));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf-8');
}
