import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideMessageSquare, LucideSearch, LucideSend, LucideUsers } from '@lucide/angular';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, LucideMessageSquare, LucideSearch, LucideSend, LucideUsers],
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent {}
