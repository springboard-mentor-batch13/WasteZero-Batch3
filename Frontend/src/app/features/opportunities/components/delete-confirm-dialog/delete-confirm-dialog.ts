// ============================================
// DELETE CONFIRM DIALOG — WasteZero M2
// Modal overlay for confirming opportunity deletion.
// M4: emits deletion reason (optional, max 255 chars) with confirmed event.
// Angular 21 zoneless: signal inputs prevent NG0100
// ============================================

import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-delete-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // ── Local state ────────────────────────────────────────────────────
  // Reason is optional; the backend accepts null and treats it as "none".
  reason = signal('');

  // ── Outputs ────────────────────────────────────────────────────────
  // confirmed now emits the reason string (may be empty) so the parent
  // can forward it to the service without needing to query dialog state.
  confirmed = output<string>();
  cancelled = output<void>();

  onConfirm(): void { this.confirmed.emit(this.reason().trim()); }
  onCancel(): void  { this.cancelled.emit(); }

}
