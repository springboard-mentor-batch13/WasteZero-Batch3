// ============================================
// DELETE CONFIRM DIALOG — WasteZero M2
// Modal overlay for confirming opportunity deletion
// Angular 21 zoneless: signal inputs prevent NG0100
// ============================================

import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-confirm-dialog.html',
  styleUrl: './delete-confirm-dialog.css'
})
export class DeleteConfirmDialog {

  // ── Signal inputs ──────────────────────────────────────────────────
  // Using input() ensures that when the parent's isDeleting() signal
  // changes, Angular propagates the new value inside the reactive graph.
  // Classic @Input() with [disabled]="isDeleting" in the template can
  // drift between check and verify passes when the parent uses signals,
  // causing NG0100. signal inputs eliminate that race entirely.
  opportunityTitle = input('');
  isDeleting       = input(false);

  // ── Outputs ────────────────────────────────────────────────────────
  confirmed = output<void>();
  cancelled = output<void>();

  onConfirm(): void { this.confirmed.emit(); }
  onCancel(): void  { this.cancelled.emit(); }

}
