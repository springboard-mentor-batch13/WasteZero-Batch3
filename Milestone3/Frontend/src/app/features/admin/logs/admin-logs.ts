import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import { AdminLog } from '../../../core/models/admin.model';

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.css',
})
export class AdminLogs implements OnInit {
  private readonly adminService = inject(AdminService);

  logs = signal<AdminLog[]>([]);
  loading = signal(true);
  error = signal('');

  action = '';
  date = '';

  page = 1;
  pageSize = 8;

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminService
      .getLogs({
        action: this.action,
        date: this.date,
      })
      .subscribe({
        next: (logs) => {
          this.logs.set(logs);
          this.page = 1;
          this.loading.set(false);
        },

        error: () => {
          this.error.set('Unable to load admin logs. Please try again.');
          this.loading.set(false);
        },
      });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.logs().length / this.pageSize));
  }

  get visibleLogs(): AdminLog[] {
    const start = (this.page - 1) * this.pageSize;

    return this.logs().slice(start, start + this.pageSize);
  }

  applyFilters(): void {
    this.loadLogs();
  }

  clearFilters(): void {
    this.action = '';
    this.date = '';
    this.loadLogs();
  }

  previousPage(): void {
    if (this.page > 1) {
      this.page--;
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
    }
  }

  actionLabel(action: string): string {
    return action
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
