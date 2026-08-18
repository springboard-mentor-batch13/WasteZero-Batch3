// ============================================
// OPPORTUNITY STORE — WasteZero M2
// Lightweight reactive store for cross-component
// refresh signalling after CRUD operations.
// ============================================

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OpportunityStore {

  /**
   * Emits void whenever an opportunity is created, updated, or deleted.
   * List components subscribe to this to reload their data automatically.
   */
  readonly refresh$ = new Subject<void>();

  notifyRefresh(): void {
    this.refresh$.next();
  }

}
