import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ENV, type Env } from '../config/config.module.js';
import { InstitutionService } from '../institution/institution.service.js';

type Doc = InstanceType<typeof PDFDocument>;

const MARGIN = 48;
const BRAND = '#0b3d6e';
const GRID = '#c9d1d9';
const MUTED = '#4a5560';

export interface PdfColumn {
  header: string;
  /** Ancho relativo respecto de las demás columnas. */
  width: number;
  align?: 'left' | 'center' | 'right';
}

export interface PdfHeaderInfo {
  institution: string;
  affiliation: string;
  canton: string;
  footer: string;
  logo: { buffer: Buffer; mimeType: string } | null;
}

/** Código corto de un documento generado: `REP-AAAAMMDD-XXXXXX`. */
export function documentCode(prefix = 'REP', now = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

const GENERATED = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

/** Escritor de documentos con encabezado institucional, tablas con salto de página y pie numerado. */
export class PdfWriter {
  private pageCount = 0;

  constructor(
    readonly doc: Doc,
    private readonly header: PdfHeaderInfo,
    readonly code: string,
    private readonly title: string,
    private readonly generatedAt: Date,
    private readonly version?: number,
  ) {
    doc.on('pageAdded', () => {
      this.pageCount++;
    });
    this.pageCount = 1;
    this.drawHeader();
  }

  get width(): number {
    return this.doc.page.width - MARGIN * 2;
  }

  private drawHeader(): void {
    const { doc, header } = this;
    const top = MARGIN - 12;
    let textX = MARGIN;
    if (header.logo && /^image\/(png|jpeg)$/.test(header.logo.mimeType)) {
      try {
        doc.image(header.logo.buffer, MARGIN, top, { fit: [48, 48] });
        textX = MARGIN + 60;
      } catch {
        // Un logotipo ilegible no debe impedir generar el documento.
      }
    }
    doc
      .fillColor(BRAND)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(header.institution, textX, top + 2, {
        width: this.width - (textX - MARGIN),
      });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    if (header.affiliation)
      doc.text(header.affiliation, textX, doc.y, {
        width: this.width - (textX - MARGIN),
      });
    if (header.canton)
      doc.text(header.canton, textX, doc.y, {
        width: this.width - (textX - MARGIN),
      });
    const lineY = Math.max(doc.y, top + 50) + 6;
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(MARGIN + this.width, lineY)
      .strokeColor(BRAND)
      .lineWidth(1.5)
      .stroke();
    doc.x = MARGIN;
    doc.y = lineY + 14;
    doc.fillColor('black');
  }

  heading(text: string): this {
    this.doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(BRAND)
      .text(text, MARGIN, this.doc.y, {
        width: this.width,
        align: 'center',
      });
    this.doc.moveDown(0.6).fillColor('black');
    return this;
  }

  subheading(text: string): this {
    this.doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('black')
      .text(text, MARGIN, this.doc.y, {
        width: this.width,
      });
    this.doc.moveDown(0.3);
    return this;
  }

  paragraph(
    text: string,
    options: { size?: number; muted?: boolean } = {},
  ): this {
    this.doc
      .font('Helvetica')
      .fontSize(options.size ?? 10)
      .fillColor(options.muted ? MUTED : 'black')
      .text(text, MARGIN, this.doc.y, { width: this.width, align: 'left' });
    this.doc.moveDown(0.5).fillColor('black');
    return this;
  }

  keyValues(pairs: readonly (readonly [string, string])[]): this {
    const { doc } = this;
    for (const [key, value] of pairs) {
      const y = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`${key}:`, MARGIN, y, { width: 130 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(value || '—', MARGIN + 135, y, { width: this.width - 135 });
      doc.y = Math.max(doc.y, y + 14);
    }
    doc.moveDown(0.5);
    return this;
  }

  /** Tabla con encabezado repetido en cada página y filas de altura variable. */
  table(
    columns: readonly PdfColumn[],
    rows: readonly (readonly string[])[],
    options: { emptyText?: string } = {},
  ): this {
    const { doc } = this;
    const total = columns.reduce((sum, c) => sum + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const pad = 4;
    const bottom = () => doc.page.height - MARGIN - 20;

    const drawRow = (
      cells: readonly string[],
      bold: boolean,
      shade: boolean,
    ) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      const heights = cells.map((text, i) =>
        doc.heightOfString(text || ' ', { width: widths[i]! - pad * 2 }),
      );
      const h = Math.max(...heights, 10) + pad * 2;
      if (doc.y + h > bottom()) {
        doc.addPage();
        this.drawHeader();
        if (!bold)
          drawRow(
            columns.map((c) => c.header),
            true,
            true,
          );
      }
      const y = doc.y;
      if (shade) {
        doc.rect(MARGIN, y, this.width, h).fill('#eaf0f6');
        doc.fillColor('black');
      }
      let x = MARGIN;
      cells.forEach((text, i) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor('black');
        doc.text(text, x + pad, y + pad, {
          width: widths[i]! - pad * 2,
          align: columns[i]!.align ?? 'left',
        });
        x += widths[i]!;
      });
      doc
        .rect(MARGIN, y, this.width, h)
        .strokeColor(GRID)
        .lineWidth(0.5)
        .stroke();
      doc.y = y + h;
      doc.x = MARGIN;
    };

    drawRow(
      columns.map((c) => c.header),
      true,
      true,
    );
    if (rows.length === 0) {
      drawRow(
        [
          options.emptyText ?? 'Sin registros',
          ...columns.slice(1).map(() => ''),
        ],
        false,
        false,
      );
    }
    for (const row of rows) drawRow(row, false, false);
    doc.moveDown(0.8);
    return this;
  }

  signatures(labels: readonly string[]): this {
    const { doc } = this;
    const perRow = Math.min(labels.length, 3) || 1;
    const colWidth = this.width / perRow;
    if (doc.y + 90 > doc.page.height - MARGIN - 20) {
      doc.addPage();
      this.drawHeader();
    }
    doc.moveDown(2);
    let y = doc.y + 24;
    labels.forEach((label, i) => {
      const col = i % perRow;
      if (i > 0 && col === 0) y += 70;
      const x = MARGIN + col * colWidth;
      doc
        .moveTo(x + 12, y)
        .lineTo(x + colWidth - 12, y)
        .strokeColor('black')
        .lineWidth(0.6)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('black')
        .text(label, x + 12, y + 4, {
          width: colWidth - 24,
          align: 'center',
        });
    });
    doc.y = y + 40;
    return this;
  }

  /** Dibuja un código QR vectorial. */
  qr(content: string, x: number, y: number, size: number): this {
    const qr = QRCode.create(content, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const cell = size / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.data[r * n + c]) {
          this.doc.rect(x + c * cell, y + r * cell, cell + 0.2, cell + 0.2);
        }
      }
    }
    this.doc.fill('black');
    return this;
  }

  /** Pie de cada página: fecha de generación, código y versión, y el texto institucional. */
  private drawFooters(): void {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - MARGIN + 6;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      const line = [
        `Generado el ${GENERATED.format(this.generatedAt)}`,
        `Documento ${this.code}${this.version ? ` · versión ${this.version}` : ''}`,
        `Página ${i + 1} de ${range.count}`,
      ].join(' · ');
      doc.text(line, MARGIN, y, {
        width: this.width,
        align: 'center',
        lineBreak: false,
      });
      if (this.header.footer) {
        doc.text(this.header.footer, MARGIN, y + 10, {
          width: this.width,
          align: 'center',
          lineBreak: false,
        });
      }
    }
  }

  async finish(): Promise<Buffer> {
    this.drawFooters();
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('data', (c: Buffer) => chunks.push(c));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
    });
    this.doc.end();
    return done;
  }

  get documentTitle(): string {
    return this.title;
  }
}

@Injectable()
export class PdfService {
  constructor(
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Crea un documento con el encabezado de la Liga. */
  async create(options: {
    title: string;
    prefix?: string;
    code?: string;
    version?: number;
    landscape?: boolean;
    now?: Date;
  }): Promise<PdfWriter> {
    const now = options.now ?? new Date();
    const header = await this.institution.documentHeader();
    let logo: PdfHeaderInfo['logo'] = null;
    try {
      logo = await this.institution.readLogo();
    } catch {
      // Sin logotipo configurado.
    }
    const doc = new PDFDocument({
      size: 'A4',
      layout: options.landscape ? 'landscape' : 'portrait',
      margin: MARGIN,
      bufferPages: true,
      // En las pruebas se deja sin comprimir para poder comprobar el texto del documento.
      compress: this.env.NODE_ENV !== 'test',
      info: { Title: options.title, Producer: 'Liga Cantonal de Quero' },
    });
    return new PdfWriter(
      doc,
      { ...header, logo },
      options.code ?? documentCode(options.prefix ?? 'REP', now),
      options.title,
      now,
      options.version,
    );
  }
}
