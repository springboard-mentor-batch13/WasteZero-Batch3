export type AdminUserRole = 'volunteer' | 'ngo' | 'admin';

export type AdminUserStatus = 'active' | 'suspended';

export type AdminLogAction =
  'LOGIN' | 'LOGOUT' | 'USER_SUSPENDED' | 'USER_ACTIVATED' | 'USER_UPDATED' | 'REPORT_DOWNLOADED';

export interface AdminUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  verified: boolean;
  joinedAt: string;
  lastActiveAt: string;
  location: string;
  phone?: string;
}

export interface AdminLog {
  id: string;
  action: AdminLogAction;
  description: string;
  actorName: string;
  actorRole: AdminUserRole;
  targetName?: string;
  createdAt: string;
}

export type ReportType = 'user' | 'pickup' | 'opportunity' | 'activity';

export interface ReportRow {
  [key: string]: string | number;
}

export interface AdminReport {
  type: ReportType;
  title: string;
  generatedAt: string;
  columns: string[];
  rows: ReportRow[];
}
