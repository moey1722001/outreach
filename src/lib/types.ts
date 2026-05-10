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
  | 'won'
  | 'not_fit';

export type OutreachTone = 'warm' | 'clinical' | 'concise';

export interface Lead {
  id: string;
  organisation: string;
  category: LeadCategory;
  website: string;
  location: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  status: LeadStatus;
  likelihood: number;
  fitSummary: string;
  needs: string[];
  source: string;
  nextAction: string;
  notes: string;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftEmail {
  subject: string;
  body: string;
}

export interface SearchBrief {
  location: string;
  categories: LeadCategory[];
  notes: string;
}

export type LeadFormInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'likelihood'> & {
  likelihood?: number;
};
