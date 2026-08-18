// ============================================
// REPORT SERVICE — WasteZero Milestone 4
// Covers all three report systems:
//   Admin:     GET /api/v1/admin/reports/...
//   NGO:       GET /api/v1/ngo/reports/...
//   Volunteer: GET /api/v1/reports/...
// ============================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ReportType, ReportFormat } from '../models/admin.model';
import { ReportBrowseResponse } from '../models/dashboard.model';
import { AuthService } from './auth.service';

/** Time-range params shared by NGO + Volunteer browse/download endpoints */
export interface TimeRangeParams {
  timeRange?: 'all' | 'week' | 'month' | 'year' | 'custom';
  year?:      number;
  month?:     number;
  startDate?: string;
  endDate?:   string;
  page?:      number;
  limit?:     number;
}

/** Options response from /options endpoints */
export interface ReportOptionsResponse {
  success: boolean;
  data: {
    reportTypes: { value: string; label: string }[];
    timeRanges:  { value: string; label: string }[];
    formats:     { value: string; label: string }[];
  };
}

/** NGO/Volunteer browse response */
export interface RoleBrowseResponse {
  success: boolean;
  data: {
    records:    Record<string, unknown>[];
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
    columns?:   { header: string; key: string }[];
    timeRange?: string;
    dateRange?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ReportService {

  private http        = inject(HttpClient);
  private authService = inject(AuthService);

  // Base URLs for each report system
  private readonly adminReportsUrl     = `${environment.apiUrl}/v1/admin/reports`;
  private readonly ngoReportsUrl       = `${environment.apiUrl}/v1/ngo/reports`;
  private readonly volunteerReportsUrl = `${environment.apiUrl}/v1/reports`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  /** Trigger the browser "Save As" dialog for a downloaded blob. */
  saveBlob(blob: Blob, filename: string): void {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Build a sensible filename: e.g. wastezero-pickups-2026-08-17.xlsx */
  buildFilename(type: string, format: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `wastezero-${type}-${date}.${format}`;
  }

  /** Convert TimeRangeParams into HttpParams (omits undefined values). */
  private timeRangeToParams(p: TimeRangeParams): HttpParams {
    let params = new HttpParams();
    if (p.timeRange) params = params.set('timeRange', p.timeRange);
    if (p.year)      params = params.set('year',      p.year.toString());
    if (p.month)     params = params.set('month',     p.month.toString());
    if (p.startDate) params = params.set('startDate', p.startDate);
    if (p.endDate)   params = params.set('endDate',   p.endDate);
    if (p.page)      params = params.set('page',      p.page.toString());
    if (p.limit)     params = params.set('limit',     p.limit.toString());
    return params;
  }

  // ── Admin Reports (/api/v1/admin/reports) ────────────────────────────────

  /**
   * GET /api/v1/admin/reports/:type?format=...
   * Returns a binary blob. Rate limited: 5 downloads/hour.
   */
  downloadAdminReport(
    type:       ReportType,
    format:     ReportFormat,
    startDate?: string,
    endDate?:   string,
    opportunityId?: string,
    ngoUsername?:   string,
    volunteerUsername?: string,
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format);
    if (startDate)         params = params.set('startDate',         startDate);
    if (endDate)           params = params.set('endDate',           endDate);
    if (opportunityId)     params = params.set('opportunityId',     opportunityId);
    if (ngoUsername)       params = params.set('ngoUsername',       ngoUsername);
    if (volunteerUsername) params = params.set('volunteerUsername', volunteerUsername);

    return this.http.get(
      `${this.adminReportsUrl}/${type}`,
      { headers: this.headers(), params, responseType: 'blob' }
    );
  }

  /** @deprecated Use downloadAdminReport(). Kept for backward-compat with existing admin-panel call. */
  downloadReport(
    type:       ReportType,
    format:     ReportFormat,
    startDate?: string,
    endDate?:   string,
  ): Observable<Blob> {
    return this.downloadAdminReport(type, format, startDate, endDate);
  }

  /**
   * GET /api/v1/admin/reports/browse/:type
   * JSON preview before download. adminLimiter (5/min).
   */
  browseAdminReport(
    type: string,
    opts: {
      page?:            number;
      limit?:           number;
      startDate?:       string;
      endDate?:         string;
      opportunityId?:   string;
      ngoUsername?:     string;
      volunteerUsername?: string;
    } = {}
  ): Observable<ReportBrowseResponse> {
    let params = new HttpParams();
    if (opts.page)            params = params.set('page',            opts.page.toString());
    if (opts.limit)           params = params.set('limit',           opts.limit.toString());
    if (opts.startDate)       params = params.set('startDate',       opts.startDate);
    if (opts.endDate)         params = params.set('endDate',         opts.endDate);
    if (opts.opportunityId)   params = params.set('opportunityId',   opts.opportunityId);
    if (opts.ngoUsername)     params = params.set('ngoUsername',     opts.ngoUsername);
    if (opts.volunteerUsername) params = params.set('volunteerUsername', opts.volunteerUsername);

    return this.http.get<ReportBrowseResponse>(
      `${this.adminReportsUrl}/browse/${type}`,
      { headers: this.headers(), params }
    );
  }

  // ── NGO Reports (/api/v1/ngo/reports) ───────────────────────────────────

  /**
   * GET /api/v1/ngo/reports/options
   * Returns available report types, time ranges, formats for the NGO UI selector.
   */
  getNgoReportOptions(): Observable<ReportOptionsResponse> {
    return this.http.get<ReportOptionsResponse>(
      `${this.ngoReportsUrl}/options`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/ngo/reports/browse/:type
   * Paginated JSON preview of NGO's own records (opportunities | applications | pickups).
   */
  browseNgoReport(type: string, params: TimeRangeParams = {}): Observable<RoleBrowseResponse> {
    return this.http.get<RoleBrowseResponse>(
      `${this.ngoReportsUrl}/browse/${type}`,
      { headers: this.headers(), params: this.timeRangeToParams(params) }
    );
  }

  /**
   * GET /api/v1/ngo/reports/download/:type?format=...
   * Streams a file (CSV, XLSX, PDF). Rate limited: 10 downloads/hour.
   */
  downloadNgoReport(type: string, format: string, params: TimeRangeParams = {}): Observable<Blob> {
    let httpParams = this.timeRangeToParams(params).set('format', format);
    return this.http.get(
      `${this.ngoReportsUrl}/download/${type}`,
      { headers: this.headers(), params: httpParams, responseType: 'blob' }
    );
  }

  // ── Volunteer Reports (/api/v1/reports) ──────────────────────────────────

  /**
   * GET /api/v1/reports/options
   * Returns available report types, time ranges, formats for the Volunteer UI selector.
   */
  getVolunteerReportOptions(): Observable<ReportOptionsResponse> {
    return this.http.get<ReportOptionsResponse>(
      `${this.volunteerReportsUrl}/options`,
      { headers: this.headers() }
    );
  }

  /**
   * GET /api/v1/reports/browse/:type
   * Paginated JSON preview of volunteer's own records (applications | opportunities | pickups).
   */
  browseVolunteerReport(type: string, params: TimeRangeParams = {}): Observable<RoleBrowseResponse> {
    return this.http.get<RoleBrowseResponse>(
      `${this.volunteerReportsUrl}/browse/${type}`,
      { headers: this.headers(), params: this.timeRangeToParams(params) }
    );
  }

  /**
   * GET /api/v1/reports/download/:type?format=...
   * Streams a file (CSV, XLSX, PDF). Rate limited: 10 downloads/hour.
   */
  downloadVolunteerReport(type: string, format: string, params: TimeRangeParams = {}): Observable<Blob> {
    let httpParams = this.timeRangeToParams(params).set('format', format);
    return this.http.get(
      `${this.volunteerReportsUrl}/download/${type}`,
      { headers: this.headers(), params: httpParams, responseType: 'blob' }
    );
  }
}
