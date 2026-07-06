import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  LucideLayoutDashboard, LucideCalendarPlus, LucideHeart,
  LucideMessageSquare, LucideUser, LucideShield, LucideLogOut,
  LucideSun, LucideMoon, LucideTruck, LucideChevronLeft
} from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

interface NavItem {
  label: string;
  route: string;
  icon: any;
  roles: string[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    LucideSun, LucideMoon, LucideLogOut, LucideChevronLeft,
    LucideLayoutDashboard, LucideCalendarPlus, LucideHeart,
    LucideMessageSquare, LucideUser, LucideShield, LucideTruck
  ],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Input() isOpen = true;
  @Output() closeSidebar = new EventEmitter<void>();

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', roles: [] },
    { label: 'Schedule Pickup', route: '/schedule-pickup', icon: 'calendar-plus', roles: ['volunteer'] },
    { label: 'Assigned Pickups', route: '/assigned-pickups', icon: 'truck', roles: ['agent'] },
    { label: 'Opportunities', route: '/opportunities', icon: 'heart', roles: [] },
    { label: 'Messages', route: '/messages', icon: 'message-square', roles: [] },
    { label: 'My Profile', route: '/profile', icon: 'user', roles: [] },
    { label: 'Admin Panel', route: '/admin', icon: 'shield', roles: ['admin'] },
  ];

  constructor(
    public authService: AuthService,
    public themeService: ThemeService
  ) {}

  get filteredNavItems(): NavItem[] {
    const role = this.authService.userRole();
    return this.navItems.filter(item => {
      if (item.roles.length === 0) return true;
      return role ? item.roles.includes(role) : false;
    });
  }

  onToggleDarkMode(): void {
    this.themeService.toggleDarkMode();
  }

  onLogout(): void {
    this.authService.logout();
  }

  onClose(): void {
    this.closeSidebar.emit();
  }
}
