import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideTruck, LucideMapPin, LucideCheckCircle, LucideClock } from '@lucide/angular';

@Component({
  selector: 'app-assigned-pickups',
  standalone: true,
  imports: [CommonModule, LucideTruck, LucideMapPin, LucideCheckCircle, LucideClock],
  templateUrl: './assigned-pickups.component.html',
  styleUrls: ['./assigned-pickups.component.css']
})
export class AssignedPickupsComponent {}
