import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideHeart, LucideUsers, LucideCalendar, LucideMapPin } from '@lucide/angular';

@Component({
  selector: 'app-opportunities',
  standalone: true,
  imports: [CommonModule, LucideHeart, LucideUsers, LucideCalendar, LucideMapPin],
  templateUrl: './opportunities.component.html',
  styleUrls: ['./opportunities.component.css']
})
export class OpportunitiesComponent {}
