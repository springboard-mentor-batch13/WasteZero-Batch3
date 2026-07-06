import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideTrendingUp, LucideRecycle, LucideLeaf, LucideClock } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LucideTrendingUp, LucideRecycle, LucideLeaf, LucideClock],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  constructor(public authService: AuthService) {}
}
