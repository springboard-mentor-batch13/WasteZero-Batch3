import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideCalendarPlus, LucideMapPin, LucideClock, LucidePackage } from '@lucide/angular';

@Component({
  selector: 'app-schedule-pickup',
  standalone: true,
  imports: [CommonModule, LucideCalendarPlus, LucideMapPin, LucideClock, LucidePackage],
  templateUrl: './schedule-pickup.component.html',
  styleUrls: ['./schedule-pickup.component.css']
})
export class SchedulePickupComponent {}
