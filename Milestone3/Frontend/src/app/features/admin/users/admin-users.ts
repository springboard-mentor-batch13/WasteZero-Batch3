import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';

import { AdminUser, AdminUserRole, AdminUserStatus } from '../../../core/models/admin.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
})
export class AdminUsers implements OnInit {
  private readonly adminService = inject(AdminService);

  users = signal<AdminUser[]>([]);
  loading = signal(true);
  error = signal('');

  search = '';
  role = 'all';
  status = 'all';

  page = 1;
  pageSize = 6;

  selectedUser = signal<AdminUser | null>(null);
  confirmUser = signal<AdminUser | null>(null);

  actionLoading = signal(false);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.page = 1;
        this.loading.set(false);
      },

      error: () => {
        this.error.set('Unable to load users. Please try again.');
        this.loading.set(false);
      },
    });
  }

  get filteredUsers(): AdminUser[] {
    const query = this.search.trim().toLowerCase();

    return this.users().filter((user) => {
      const matchesSearch =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);

      const matchesRole = this.role === 'all' || user.role === this.role;

      const matchesStatus = this.status === 'all' || user.status === this.status;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get visibleUsers(): AdminUser[] {
    const start = (this.page - 1) * this.pageSize;

    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  onFilterChange(): void {
    this.page = 1;
  }

  clearFilters(): void {
    this.search = '';
    this.role = 'all';
    this.status = 'all';
    this.page = 1;
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

  viewUser(user: AdminUser): void {
    this.selectedUser.set(user);
  }

  closeDetails(): void {
    this.selectedUser.set(null);
  }

  requestStatusChange(user: AdminUser): void {
    if (user.role !== 'admin') {
      this.confirmUser.set(user);
    }
  }

  cancelStatusChange(): void {
    this.confirmUser.set(null);
  }

  confirmStatusChange(): void {
    const user = this.confirmUser();

    if (!user) {
      return;
    }

    const nextStatus: AdminUserStatus = user.status === 'active' ? 'suspended' : 'active';

    this.actionLoading.set(true);

    this.adminService.updateUserStatus(user.id, nextStatus).subscribe({
      next: (updatedUser) => {
        this.users.update((users) =>
          users.map((item) =>
            item.id === updatedUser.id
              ? {
                  ...item,
                  ...updatedUser,
                }
              : item,
          ),
        );

        this.confirmUser.set(null);
        this.selectedUser.set(null);
        this.actionLoading.set(false);
      },

      error: () => {
        this.error.set('The user status could not be changed.');

        this.actionLoading.set(false);
        this.confirmUser.set(null);
      },
    });
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  roleLabel(role: AdminUserRole): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }
}
