import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';

import { AdminReport, ReportType } from '../../../core/models/admin.model';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-reports.html',
  styleUrl: './admin-reports.css',
})
export class AdminReports implements OnInit {
  private readonly adminService = inject(AdminService);

  reportType: ReportType = 'user';

  startDate = this.daysAgo(30);
  endDate = this.today();

  format = 'csv';

  report = signal<AdminReport | null>(null);

  loading = signal(false);
  downloading = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {
    if (!this.startDate || !this.endDate || this.startDate > this.endDate) {
      this.error.set('Please select a valid date range.');

      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.adminService.getReport(this.reportType, this.startDate, this.endDate).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loading.set(false);
      },

      error: () => {
        this.error.set('Unable to generate this report. Please try again.');

        this.loading.set(false);
      },
    });
  }

  download(): void {
    const report = this.report();

    if (!report) {
      return;
    }

    this.downloading.set(true);

    try {
      if (this.format === 'csv') {
        this.downloadBlob(this.csv(report), `${report.type}-report.csv`, 'text/csv;charset=utf-8');
      } else if (this.format === 'excel') {
        this.downloadBlob(
          this.excel(report),
          `${report.type}-report.xls`,
          'application/vnd.ms-excel;charset=utf-8',
        );
      } else {
        this.downloadPdf(report);
      }
    } catch {
      this.error.set('The report could not be downloaded.');
    } finally {
      setTimeout(() => {
        this.downloading.set(false);
      }, 400);
    }
  }

  private csv(report: AdminReport): string {
    return [
      report.columns,
      ...report.rows.map((row) => report.columns.map((column) => String(row[column] ?? ''))),
    ]
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
  }

  private excel(report: AdminReport): string {
    const header = report.columns.map((column) => `<th>${this.escapeHtml(column)}</th>`).join('');

    const body = report.rows
      .map(
        (row) =>
          `<tr>${report.columns
            .map((column) => `<td>${this.escapeHtml(String(row[column] ?? ''))}</td>`)
            .join('')}</tr>`,
      )
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body>
          <h2>${this.escapeHtml(report.title)}</h2>

          <table border="1">
            <thead>
              <tr>
                ${header}
              </tr>
            </thead>

            <tbody>
              ${body}
            </tbody>
          </table>
        </body>
      </html>
    `;
  }

  private downloadPdf(report: AdminReport): void {
    const lines = [
      this.ascii(report.title),
      `Date range: ${this.startDate} to ${this.endDate}`,
      '',
      report.columns.join(' | '),
      ...report.rows.map((row) =>
        report.columns.map((column) => this.ascii(String(row[column] ?? ''))).join(' | '),
      ),
    ];

    this.downloadBlob(this.makePdf(lines), `${report.type}-report.pdf`, 'application/pdf');
  }

  private makePdf(lines: string[]): Blob {
    const safeLines = lines.slice(0, 28).map((line) => line.slice(0, 105));

    const content = [
      'BT',
      '/F1 10 Tf',
      '50 760 Td',

      ...safeLines
        .flatMap((line, index) => [
          `(${this.pdfEscape(line)}) Tj`,
          index < safeLines.length - 1 ? '0 -22 Td' : '',
        ])
        .filter(Boolean),

      'ET',
    ].join('\n');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',

      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',

      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',

      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',

      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = '%PDF-1.4\n';

    const offsets: number[] = [0];

    objects.forEach((object, index) => {
      offsets[index + 1] = pdf.length;

      pdf += `${index + 1} 0 obj\n` + `${object}\n` + `endobj\n`;
    });

    const xref = pdf.length;

    pdf += `xref\n` + `0 ${objects.length + 1}\n` + `0000000000 65535 f \n`;

    for (let index = 1; index <= objects.length; index++) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    pdf +=
      `trailer\n` +
      `<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
      `startxref\n` +
      `${xref}\n` +
      `%%EOF`;

    return new Blob([pdf], {
      type: 'application/pdf',
    });
  }

  private downloadBlob(content: BlobPart, filename: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));

    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(url);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  private pdfEscape(value: string): string {
    return this.ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  }

  private ascii(value: string): string {
    return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgo(days: number): string {
    const date = new Date();

    date.setDate(date.getDate() - days);

    return date.toISOString().slice(0, 10);
  }
}
