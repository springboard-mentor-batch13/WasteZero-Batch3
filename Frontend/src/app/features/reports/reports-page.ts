// ============================================
// REPORTS PAGE — WasteZero Milestone 4
// Route: /reports (all authenticated roles)
// Role-adaptive: Volunteer | NGO | Admin
// ============================================

import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import {
  ReportService,
  ReportOptionsResponse,
  RoleBrowseResponse,
  TimeRangeParams,
} from '../../core/services/report.service';
import { ReportBrowseResponse } from '../../core/models/dashboard.model';
import { ReportType, ReportFormat } from '../../core/models/admin.model';

type Role = 'volunteer' | 'ngo' | 'admin';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.css',
})
export class ReportsPage implements OnInit, OnDestroy {

  private authService   = inject(AuthService);
  private reportService = inject(ReportService);
  private snackBar      = inject(MatSnackBar);
  private destroy$      = new Subject<void>();

  readonly role = computed<Role>(() => (this.authService.currentUser()?.role as Role) ?? 'volunteer');
  readonly isAdmin     = computed(() => this.role() === 'admin');
  readonly isNgo       = computed(() => this.role() === 'ngo');
  readonly isVolunteer = computed(() => this.role() === 'volunteer');

  reportTypes  = signal<{ value: string; label: string }[]>([]);
  timeRanges   = signal<{ value: string; label: string }[]>([]);
  formats      = signal<{ value: string; label: string }[]>([]);
  loadingOpts  = signal(true);

  selectedType      = signal('');
  selectedFormat    = signal<string>('csv');
  selectedTimeRange = signal<string>('all');
  filterYear        = signal<number>(new Date().getFullYear());
  filterMonth       = signal<number>(new Date().getMonth() + 1);
  filterStartDate   = signal('');
  filterEndDate     = signal('');

  readonly showDateRange = computed(() => this.selectedTimeRange() === 'custom');
  readonly showYearMonth = computed(() =>
    this.selectedTimeRange() === 'month' || this.selectedTimeRange() === 'year'
  );

  adminFilterStartDate   = signal('');
  adminFilterEndDate     = signal('');
  adminNgoUsername       = signal('');
  adminVolunteerUsername = signal('');

  browseLoading    = signal(false);
  browseError      = signal('');
  browseColumns    = signal<{ header: string; key: string }[]>([]);
  browseRecords    = signal<Record<string, unknown>[]>([]);
  browseTotal      = signal(0);
  browsePage       = signal(1);
  browseLimit      = signal(20);
  browseTotalPages = signal(0);
  browseDateRange  = signal('');
  hasBrowseData    = signal(false);

  readonly hasPrev = computed(() => this.browsePage() > 1);
  readonly hasNext = computed(() => this.browsePage() < this.browseTotalPages());

  downloading = signal(false);

  readonly years  = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  readonly months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' },   { value: 4, label: 'April' },
    { value: 5, label: 'May' },     { value: 6, label: 'June' },
    { value: 7, label: 'July' },    { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  ngOnInit(): void { this.loadOptions(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private loadOptions(): void {
    this.loadingOpts.set(true);
    const role = this.role();

    if (role === 'admin') {
      this.reportTypes.set([
        { value: 'users',         label: 'Users' },
        { value: 'pickups',       label: 'Pickups' },
        { value: 'opportunities', label: 'Opportunities' },
        { value: 'applications',  label: 'Applications' },
        { value: 'full-activity', label: 'Full Activity Log' },
      ]);
      this.formats.set([
        { value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'XLSX' }, { value: 'pdf', label: 'PDF' },
      ]);
      this.selectedType.set('users');
      this.loadingOpts.set(false);
      return;
    }

    const obs$ = role === 'ngo'
      ? this.reportService.getNgoReportOptions()
      : this.reportService.getVolunteerReportOptions();

    obs$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: ReportOptionsResponse) => {
        this.reportTypes.set(res.data.reportTypes);
        this.timeRanges.set(res.data.timeRanges);
        this.formats.set(res.data.formats);
        if (res.data.reportTypes.length) this.selectedType.set(res.data.reportTypes[0].value);
        if (res.data.timeRanges.length)  this.selectedTimeRange.set(res.data.timeRanges[0].value);
        if (res.data.formats.length)     this.selectedFormat.set(res.data.formats[0].value);
        this.loadingOpts.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.snackBar.open(err.error?.message || 'Failed to load options.', 'x', { duration: 4000 });
        this.loadingOpts.set(false);
      }
    });
  }

  onTypeChange(): void {
    this.hasBrowseData.set(false);
    this.browseRecords.set([]);
    this.browseColumns.set([]);
    this.browsePage.set(1);
    this.browseError.set('');
  }

  browse(page = 1): void {
    const type = this.selectedType();
    if (!type) return;
    this.browseLoading.set(true);
    this.browseError.set('');
    this.browsePage.set(page);
    const role = this.role();

    if (role === 'admin') {
      this.reportService.browseAdminReport(type, {
        page, limit: this.browseLimit(),
        startDate:         this.adminFilterStartDate()   || undefined,
        endDate:           this.adminFilterEndDate()     || undefined,
        ngoUsername:       this.adminNgoUsername()       || undefined,
        volunteerUsername: this.adminVolunteerUsername() || undefined,
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: ReportBrowseResponse) => this.applyAdminBrowse(res),
        error: (e: { error?: { message?: string } }) => this.handleBrowseError(e),
      });
    } else {
      const params = this.buildTimeRangeParams(page);
      const obs$ = role === 'ngo'
        ? this.reportService.browseNgoReport(type, params)
        : this.reportService.browseVolunteerReport(type, params);
      obs$.pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: RoleBrowseResponse) => this.applyRoleBrowse(res),
        error: (e: { error?: { message?: string } }) => this.handleBrowseError(e),
      });
    }
  }

  private applyAdminBrowse(res: ReportBrowseResponse): void {
    this.browseColumns.set(res.data.columns ?? []);
    this.browseRecords.set(res.data.records);
    this.browseTotal.set(res.data.total);
    this.browseTotalPages.set(res.data.totalPages);
    this.hasBrowseData.set(true);
    this.browseLoading.set(false);
  }

  private applyRoleBrowse(res: RoleBrowseResponse): void {
    const cols = (res.data.columns && res.data.columns.length > 0)
      ? res.data.columns
      : Object.keys(res.data.records[0] ?? {}).map(k => ({ header: this.humanize(k), key: k }));
    this.browseColumns.set(cols);
    this.browseRecords.set(res.data.records);
    this.browseTotal.set(res.data.total);
    this.browseTotalPages.set(res.data.totalPages);
    this.browseDateRange.set(res.data.dateRange ?? '');
    this.hasBrowseData.set(true);
    this.browseLoading.set(false);
  }

  private handleBrowseError(err: { error?: { message?: string } }): void {
    this.browseError.set(err.error?.message || 'Failed to load preview.');
    this.browseLoading.set(false);
  }

  prevPage(): void { if (this.hasPrev()) this.browse(this.browsePage() - 1); }
  nextPage(): void { if (this.hasNext()) this.browse(this.browsePage() + 1); }

  cellValue(record: Record<string, unknown>, key: string): string {
    const val = key.split('.').reduce<unknown>((o, k) =>
      o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined, record);
    if (val == null) return 'n/a';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val))
      return new Date(val).toLocaleDateString();
    return String(val);
  }

  download(): void {
    const type = this.selectedType(), format = this.selectedFormat();
    if (!type || !format) return;
    this.downloading.set(true);
    const role = this.role();

    let obs$: ReturnType<typeof this.reportService.downloadVolunteerReport>;
    if (role === 'admin') {
      obs$ = this.reportService.downloadAdminReport(
        type as ReportType, format as ReportFormat,
        this.adminFilterStartDate() || undefined, this.adminFilterEndDate() || undefined,
        undefined, this.adminNgoUsername() || undefined, this.adminVolunteerUsername() || undefined,
      );
    } else if (role === 'ngo') {
      obs$ = this.reportService.downloadNgoReport(type, format, this.buildTimeRangeParams());
    } else {
      obs$ = this.reportService.downloadVolunteerReport(type, format, this.buildTimeRangeParams());
    }

    obs$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob: Blob) => {
        this.reportService.saveBlob(blob, this.reportService.buildFilename(type, format));
        this.downloading.set(false);
        this.snackBar.open('Report downloaded!', 'x', { duration: 3000 });
      },
      error: (err: { error?: { message?: string } }) => {
        this.downloading.set(false);
        this.snackBar.open(err.error?.message ?? 'Download failed.', 'x', { duration: 5000 });
      }
    });
  }

  private buildTimeRangeParams(page = this.browsePage()): TimeRangeParams {
    const tr = this.selectedTimeRange() as TimeRangeParams['timeRange'];
    const p: TimeRangeParams = { timeRange: tr, page, limit: this.browseLimit() };
    if (tr === 'month')  { p.year = this.filterYear(); p.month = this.filterMonth(); }
    if (tr === 'year')   { p.year = this.filterYear(); }
    if (tr === 'custom') { p.startDate = this.filterStartDate(); p.endDate = this.filterEndDate(); }
    return p;
  }

  private humanize(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()).trim();
  }

  getTypeLabel(value: string): string {
    return this.reportTypes().find(t => t.value === value)?.label ?? value;
  }
}
