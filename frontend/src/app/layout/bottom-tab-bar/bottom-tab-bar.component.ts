import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  LucideLayoutDashboard, LucideCalendarPlus, LucideHeart,
  LucideMessageSquare, LucideUser
} from '@lucide/angular';

interface TabItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-bottom-tab-bar',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    LucideLayoutDashboard, LucideCalendarPlus, LucideHeart,
    LucideMessageSquare, LucideUser
  ],
  templateUrl: './bottom-tab-bar.component.html',
  styleUrls: ['./bottom-tab-bar.component.css']
})
export class BottomTabBarComponent {
  tabs: TabItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Schedule', route: '/schedule-pickup', icon: 'calendar-plus' },
    { label: 'Volunteer', route: '/opportunities', icon: 'heart' },
    { label: 'Chat', route: '/messages', icon: 'message-square' },
    { label: 'Profile', route: '/profile', icon: 'user' },
  ];
}
