import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function formatBRL(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const clean = dateStr.trim();
  // Match YYYY-MM-DD prefix
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const dt = new Date(clean);
  if (Number.isNaN(dt.getTime())) return clean;
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return formatDateBR(dateStr);
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

export function exportToExcelCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (cell: string | number) => {
    const str = String(cell ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvLines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((row) => row.map(escapeCell).join(';')),
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function drawFourColorStripe(doc: jsPDF, y: number, height = 1.6): void {
  const width = doc.internal.pageSize.getWidth();
  const seg = width / 4;
  const colors: [number, number, number][] = [
    [14, 90, 117],  // Azul #0E5A75
    [235, 180, 40], // Amarelo #EBB428
    [189, 75, 34],  // Vermelho #BD4B22
    [111, 135, 61], // Verde #6F873D
  ];
  colors.forEach(([r, g, b], idx) => {
    doc.setFillColor(r, g, b);
    doc.rect(seg * idx, y, seg + 0.2, height, 'F');
  });
}

export function exportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
): void {
  const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait' });

  doc.setFillColor(20, 74, 71);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, 'F');
  drawFourColorStripe(doc, 26, 1.5);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Instituto SER — Gestão Integrada', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Vida em movimento. Propósito em ação. · Emitido em ${formatDateBR(new Date().toISOString())}`, 14, 19);

  doc.setTextColor(24, 36, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(85, 98, 98);
  doc.text(subtitle, 14, 43);

  autoTable(doc, {
    startY: 49,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? '—'))),
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [24, 36, 36],
      lineColor: [229, 225, 216],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [20, 74, 71],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [247, 245, 240],
    },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export interface InstitutionalDocumentPDFInput {
  docTitle: string;
  docCategory: string;
  cityAndDate: string;
  fields: { label: string; value: string }[];
  paragraphs: string[];
  signerLeftTitle: string;
  signerLeftSub: string;
  signerRightTitle?: string;
  signerRightSub?: string;
  filename: string;
}

export function generateInstitutionalDocumentPDF(input: InstitutionalDocumentPDFInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const maxWidth = pageWidth - marginX * 2;

  // Header band (#144A47) + 4-color brand stripe
  doc.setFillColor(20, 74, 71);
  doc.rect(0, 0, pageWidth, 30, 'F');
  drawFourColorStripe(doc, 30, 1.6);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('INSTITUTO SER — GESTÃO INTEGRADA', marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Vida em movimento. Propósito em ação.', marginX, 19.5);
  doc.text(input.docCategory.toUpperCase(), marginX, 25.5);

  // Document Title
  let y = 45;
  doc.setTextColor(24, 36, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(input.docTitle.toUpperCase(), maxWidth);
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 6 + 6;

  // Structured identification fields
  const validFields = input.fields.filter((f) => f.value && f.value.trim().length > 0);
  if (validFields.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [['Identificação e Dados do Registro', 'Informação']],
      body: validFields.map((f) => [f.label, f.value]),
      styles: {
        fontSize: 9,
        cellPadding: 2.8,
        textColor: [24, 36, 36],
        lineColor: [229, 225, 216],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [247, 245, 240],
        textColor: [20, 74, 71],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: 'bold', textColor: [85, 98, 98] },
      },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y + 30) + 10;
  }

  // Body paragraphs
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 36, 36);

  for (const para of input.paragraphs) {
    if (!para.trim()) continue;
    const lines = doc.splitTextToSize(para.trim(), maxWidth);
    const blockHeight = lines.length * 5.2 + 4;
    if (y + blockHeight > pageHeight - 52) {
      doc.addPage();
      y = 22;
    }
    doc.text(lines, marginX, y);
    y += blockHeight;
  }

  // Date & Location
  if (y > pageHeight - 58) {
    doc.addPage();
    y = 25;
  }
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(input.cityAndDate, marginX, y);

  // Signature block
  const sigY = Math.max(y + 24, pageHeight - 48);
  const sigWidth = input.signerRightTitle ? 74 : 95;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(marginX, sigY, marginX + sigWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(input.signerLeftTitle, marginX, sigY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(input.signerLeftSub, marginX, sigY + 9.5);

  if (input.signerRightTitle) {
    const rightX = pageWidth - marginX - sigWidth;
    doc.line(rightX, sigY, rightX + sigWidth, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(input.signerRightTitle, rightX, sigY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(input.signerRightSub || '', rightX, sigY + 9.5);
  }

  // Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, pageHeight - 18, pageWidth - marginX, pageHeight - 18);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Documento emitido eletronicamente pelo sistema Instituto SER — Gestão Integrada em ${formatDateBR(new Date().toISOString())}.`,
    pageWidth / 2,
    pageHeight - 12,
    { align: 'center' }
  );

  doc.save(input.filename.endsWith('.pdf') ? input.filename : `${input.filename}.pdf`);
}

