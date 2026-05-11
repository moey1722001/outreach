export type LeadCategory =
  | 'NDIS support coordinator'
  | 'Home Care Package provider'
  | 'Retirement village'
  | 'Aged care provider'
  | 'GP clinic'
  | 'Allied health provider';

export type LeadStatus =
  | 'new'
  | 'researching'
  | 'qualified'
  | 'drafted'
  | 'reviewed'
  | 'contacted'
  | 'follow_up'
  | 'replied'
  | 'interested'
  | 'meeting_booked'
  | 'not_interested'
  | 'won'
  | 'not_fit';

export type OutreachTone = 'warm' | 'clinical' | 'concise';
export type ModelMode = 'save_tokens' | 'launch_quality';

export type ContactMethod = 'email_sent' | 'phone_call' | 'meeting' | 'manual_note';

export interface ContactEvent {
  id: string;
  leadId: string;
  method: ContactMethod;
  contactedAt: string;
  contactedBy: string;
  emailAddressUsed: string;
  draftSubject: string;
  draftBody: string;
  notes: string;
  outcome: string;
  followUpDate: string;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  leadId: string;
  subject: string;
  body: string;
  tone: OutreachTone;
  generatedAt: string;
  reviewedAt: string | null;
  sentAt: string | null;
  createdBy: string;
}

export interface Lead {
  id: string;
  organisation: string;
  category: LeadCategory;
  website: string;
  location: string;
  suburb: string;
  postcode: string;
  region: string;
  radiusKm: number | null;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  status: LeadStatus;
  likelihood: number;
  fitSummary: string;
  suitabilitySummary: string;
  businessNeeds: string[];
  servicesOffered: string[];
  concerns: string[];
  outreachAngle: string;
  researchConfidence: number;
  needs: string[];
  source: string;
  nextAction: string;
  notes: string;
  lastContactedAt: string | null;
  contactedBy: string;
  followUpDate: string;
  outcome: string;
  contactHistory: ContactEvent[];
  emailHistory: EmailRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface DraftEmail {
  subject: string;
  body: string;
}

export interface SearchBrief {
  location: string;
  suburb: string;
  postcode: string;
  region: string;
  radiusKm: number | null;
  leadCount: number;
  categories: LeadCategory[];
  notes: string;
  modelMode: ModelMode;
}

export type LeadFormInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'likelihood'> & {
  likelihood?: number;
};

export interface DuplicateMatch {
  leadId: string;
  organisation: string;
  matchedOn: Array<'email' | 'organisation' | 'website' | 'phone'>;
  status: LeadStatus;
  lastContactedAt: string | null;
}
