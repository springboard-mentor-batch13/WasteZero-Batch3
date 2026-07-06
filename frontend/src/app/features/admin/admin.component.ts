import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideShield, LucideUsers, LucideBarChart3, LucideSettings } from '@lucide/angular';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, LucideShield, LucideUsers, LucideBarChart3, LucideSettings],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent {}
