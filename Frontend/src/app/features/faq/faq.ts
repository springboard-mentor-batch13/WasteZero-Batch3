import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface FaqItem {
  id: string;
  category: 'account' | 'pickups' | 'opportunities' | 'messaging' | 'notifications' | 'impact';
  question: string;
  answer: string;
  tags: string[];
}

export interface AdminContact {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: string;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faq.html',
  styleUrl: './faq.css'
})
export class FaqPage {
  private http = inject(HttpClient);
  private router = inject(Router);
  public authService = inject(AuthService);

  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');
  
  // All questions start collapsed by default
  expandedItems = signal<Set<string>>(new Set());

  // Admin dialogue state
  showAdminModal = signal(false);
  loadingAdmin = signal(false);
  adminContact = signal<AdminContact | null>(null);
  adminError = signal<string>('');

  readonly isNonAdmin = computed(() => {
    const role = this.authService.getCurrentUser()?.role;
    return role === 'volunteer' || role === 'ngo';
  });

  categories = [
    { id: 'all', label: 'All Questions', icon: 'help_outline' },
    { id: 'account', label: 'Account & Security', icon: 'manage_accounts' },
    { id: 'pickups', label: 'Waste Pickups', icon: 'local_shipping' },
    { id: 'opportunities', label: 'Opportunities', icon: 'volunteer_activism' },
    { id: 'messaging', label: 'Messaging & Chat', icon: 'chat_bubble_outline' },
    { id: 'notifications', label: 'Notifications', icon: 'notifications_none' },
    { id: 'impact', label: 'Impact & Leaderboard', icon: 'leaderboard' },
  ];

  faqList: FaqItem[] = [
    // Account & Security
    {
      id: 'acc-1',
      category: 'account',
      question: 'What user roles are available on WasteZero and what can each role do?',
      answer: 'WasteZero supports three user roles:\n• <strong>Volunteer:</strong> Can schedule door-to-door waste pickups, track personal environmental impact (kg waste collected and CO₂ saved), browse community opportunities, submit applications, and message registered NGOs.\n• <strong>NGO (Non-Governmental Organization):</strong> Can claim pending pickups within their coverage areas, review volunteer applications, create and publish community waste-drive opportunities, record completion stats, and chat with volunteers.\n• <strong>Admin:</strong> Has full platform oversight including user suspension/moderation, opportunity management, audit logging, system metrics, and dual platform leaderboards.',
      tags: ['role', 'volunteer', 'ngo', 'admin', 'permissions']
    },
    {
      id: 'acc-2',
      category: 'account',
      question: 'How does email verification work during registration?',
      answer: 'When you sign up, an authentic 6-digit One-Time Password (OTP) is sent to your registered email address. You must verify this OTP on the verification screen to activate your account. Unverified accounts cannot schedule pickups or create opportunities.',
      tags: ['register', 'signup', 'otp', 'verification', 'email']
    },
    {
      id: 'acc-3',
      category: 'account',
      question: 'How do I change my password securely?',
      answer: 'To change your password, go to <strong>Change Password</strong> in the sidebar or under your profile menu. WasteZero enforces two-factor security for password changes by sending a verification OTP to your registered email before applying the new password.',
      tags: ['password', 'change password', 'security', 'otp']
    },
    {
      id: 'acc-4',
      category: 'account',
      question: 'Why is there a single Admin policy on WasteZero?',
      answer: 'To ensure strict operational integrity and prevent unauthorized privilege escalation, WasteZero enforces a unique single-admin constraint at both the application and database layers. Creating an admin account requires a dedicated server-side administrator initialization secret.',
      tags: ['admin', 'security', 'single admin', 'policy']
    },

    // Waste Pickups
    {
      id: 'pic-1',
      category: 'pickups',
      question: 'How do Volunteers schedule a waste pickup?',
      answer: 'Navigate to <strong>Schedule Pickup</strong> from the sidebar. Select the categories of recyclable waste you have (Plastic, Paper, Glass, Metal, E-Waste, Organic), enter the estimated weight in kilograms, choose your preferred pickup date and time window (e.g. 09:00 AM – 12:00 PM), and provide your full collection address. Once submitted, nearby NGOs in your service area will be notified.',
      tags: ['schedule', 'pickup', 'waste', 'recycling', 'address']
    },
    {
      id: 'pic-2',
      category: 'pickups',
      question: 'What are the possible stages/statuses of a waste pickup?',
      answer: 'A pickup moves through the following lifecycle states:\n• <strong>Pending:</strong> Scheduled by volunteer, waiting for an NGO to accept and assign a collection agent.\n• <strong>Assigned:</strong> An NGO has accepted the request and scheduled agent pickup.\n• <strong>Completed:</strong> The waste has been collected and verified. Waste weights and calculated CO₂ savings are credited to both the volunteer and NGO.\n• <strong>Missed:</strong> The scheduled pickup window elapsed without collection.\n• <strong>Cancelled:</strong> Cancelled by either the volunteer or NGO prior to completion.',
      tags: ['pickup status', 'pending', 'assigned', 'completed', 'missed', 'cancelled']
    },
    {
      id: 'pic-3',
      category: 'pickups',
      question: 'What happens if a pickup is missed or cancelled?',
      answer: 'If a pickup window elapses without completion, WasteZero\'s automated sweep marks it as <strong>Missed</strong> and triggers real-time alerts. Volunteers can reschedule missed pickups up to a maximum of 3 times. If a pickup exceeds the reschedule cap, it is automatically closed to maintain service quality.',
      tags: ['missed pickup', 'reschedule', 'cap', 'cancel']
    },
    {
      id: 'pic-4',
      category: 'pickups',
      question: 'How do NGOs receive and claim pickup requests?',
      answer: 'NGOs set their primary and secondary operating cities and supported waste types in their profile. WasteZero\'s coverage matching engine automatically routes pending pickups to matching NGOs in that district, where they can claim and assign agents in the <strong>Pickup Management</strong> console.',
      tags: ['ngo', 'coverage', 'claim pickup', 'location matching']
    },

    // Opportunities
    {
      id: 'opp-1',
      category: 'opportunities',
      question: 'How do community Opportunities work?',
      answer: 'NGOs and Admins can publish cleanup drives, tree planting initiatives, and recycling workshops under <strong>Opportunities</strong>. Each opportunity specifies required skills, location, target dates, volunteer requirements, and expected duration.',
      tags: ['opportunities', 'volunteer drives', 'community', 'events']
    },
    {
      id: 'opp-2',
      category: 'opportunities',
      question: 'Can Volunteers apply to multiple opportunities?',
      answer: 'Yes, volunteers can browse all active opportunities and submit applications. However, to prevent duplicate entries, a volunteer may only have 1 active application per specific opportunity at any given time.',
      tags: ['apply', 'application', 'duplicate', 'rules']
    },
    {
      id: 'opp-3',
      category: 'opportunities',
      question: 'How are Volunteer hours recorded and verified?',
      answer: 'When an NGO reviews and accepts an application, the scheduled volunteer hours for that event are officially credited to the volunteer\'s profile and dashboard KPI statistics upon event completion.',
      tags: ['hours', 'metrics', 'accepted applications', 'kpi']
    },

    // Messaging & Chat
    {
      id: 'msg-1',
      category: 'messaging',
      question: 'How does real-time chat work on WasteZero?',
      answer: 'WasteZero provides instant real-time messaging powered by Socket.IO. Volunteers can communicate directly with NGOs regarding pickup logistics and opportunities, while Admins can communicate with all users.',
      tags: ['chat', 'messages', 'realtime', 'socket']
    },
    {
      id: 'msg-2',
      category: 'messaging',
      question: 'Are my messages secure and private?',
      answer: 'Yes. All messages exchanged on WasteZero are encrypted in the database using industry-standard AES-256-GCM authenticated encryption. Messages are decrypted only for authorized conversation participants in active sessions.',
      tags: ['encryption', 'aes-256-gcm', 'security', 'privacy']
    },

    // Notifications
    {
      id: 'not-1',
      category: 'notifications',
      question: 'What is the difference between General and Text notifications?',
      answer: 'WasteZero categorizes notifications into two streams for clarity:\n• <strong>General Notifications:</strong> Real-time alerts for pickup assignments, status changes (completed, missed, cancelled), and opportunity updates.\n• <strong>Text Notifications:</strong> Direct conversation alerts when another user sends you a message.',
      tags: ['notifications', 'general', 'text', 'categories']
    },
    {
      id: 'not-2',
      category: 'notifications',
      question: 'How do "Read All" and "Clear All" work?',
      answer: '• <strong>Read All:</strong> Allows you to mark all unread notifications in your current tab (General or Text) as read with a single click, updating your unread badge immediately.\n• <strong>Clear All:</strong> Permanently removes all notifications from your account and deletes them from the database after your confirmation in the dialog.',
      tags: ['read all', 'clear all', 'database deletion', 'badge']
    },

    // Impact & Leaderboards
    {
      id: 'imp-1',
      category: 'impact',
      question: 'How are CO₂ savings and recycling metrics calculated?',
      answer: 'When a pickup is marked completed, the collected weight of each waste category is multiplied by scientifically validated carbon-offset factors (e.g. Plastic ~1.5 kg CO₂/kg, Metal ~4.0 kg CO₂/kg, Paper ~1.1 kg CO₂/kg, Glass ~0.3 kg CO₂/kg, E-Waste ~2.5 kg CO₂/kg). The result is permanently credited to your environmental impact stats.',
      tags: ['co2', 'factors', 'carbon offset', 'waste stats']
    },
    {
      id: 'imp-2',
      category: 'impact',
      question: 'How does the platform Leaderboard work?',
      answer: 'The Leaderboard ranks the top contributors across the platform based on total CO₂ saved and waste volume collected. Separate rankings are provided for Volunteers and NGOs. The top three ranks receive Gold 🥇, Silver 🥈, and Bronze 🥉 honors.',
      tags: ['leaderboard', 'rankings', 'gold', 'silver', 'bronze', 'medals']
    }
  ];

  filteredFaqList = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.faqList.filter(item => {
      const matchCat = cat === 'all' || item.category === cat;
      if (!matchCat) return false;

      if (!q) return true;

      const inQuestion = item.question.toLowerCase().includes(q);
      const inAnswer = item.answer.toLowerCase().includes(q);
      const inTags = item.tags.some(t => t.toLowerCase().includes(q));

      return inQuestion || inAnswer || inTags;
    });
  });

  toggleItem(id: string): void {
    this.expandedItems.update(set => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedItems().has(id);
  }

  expandAll(): void {
    const allIds = this.filteredFaqList().map(i => i.id);
    this.expandedItems.set(new Set(allIds));
  }

  collapseAll(): void {
    this.expandedItems.set(new Set());
  }

  setCategory(catId: string): void {
    this.selectedCategory.set(catId);
  }

  openMessagesFlow(): void {
    this.showAdminModal.set(true);
    this.loadingAdmin.set(true);
    this.adminError.set('');
    this.adminContact.set(null);

    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http.get<{ success: boolean; data: AdminContact }>(
      `${environment.apiUrl}/users/admin-contact`,
      { headers }
    ).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.adminContact.set(res.data);
        } else {
          this.adminError.set('Administrator contact details are currently unavailable.');
        }
        this.loadingAdmin.set(false);
      },
      error: (err) => {
        this.adminError.set(err.error?.message || 'Could not load Administrator contact details.');
        this.loadingAdmin.set(false);
      }
    });
  }

  closeAdminModal(): void {
    this.showAdminModal.set(false);
  }

  chatWithAdmin(): void {
    const admin = this.adminContact();
    if (!admin) return;

    this.showAdminModal.set(false);
    this.router.navigate(['/messages'], {
      queryParams: {
        contactId: admin._id,
        contactName: admin.name,
        contactRole: 'admin',
        contactUsername: admin.username
      }
    });
  }
}
