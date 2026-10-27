import raw from './courses.json';
import { PATHWAY_IDS, type PathwayId } from './types';

/**
 * Typed access to courses.json.
 *
 * The JSON file is the single place a price or a module changes, so every page
 * and the Worker read it through this module rather than hard-coding a number.
 */

export interface CourseModule {
  title: string;
  semester: number;
  /** null means the client has not supplied the description yet. Never invented. */
  description: string | null;
}

export interface SalaryRange {
  min: number;
  max: number;
  period: string;
}

export interface Tuition {
  monthly: number;
  months: number;
  total: number;
}

/** Which illustrated icon belongs to a pathway. */
export type PathArt = 'cyber' | 'cloud' | 'software';

export interface Pathway {
  id: PathwayId;
  name: string;
  shortName: string;
  /** The custom artwork for this pathway, drawn inline in src/components/pathArt.ts. */
  art: PathArt;
  summary: string;
  tuition: Tuition;
  moduleDescriptionStatus: string;
  salaryRange: SalaryRange;
  modules: CourseModule[];
}

export interface PaymentOptionConfig {
  id: string;
  label: string;
  detail: string;
}

export interface CoursesConfig {
  intakeYear: number;
  currency: string;
  currencySymbol: string;
  salaryRangesApprovedForDisplay: boolean;
  salaryNote: string;
  creditEquivalents: number;
  fees: {
    vat: { statusConfirmed: boolean; placeholder: string };
    /** Tuition is priced per pathway; these are the shared rules. */
    months: number;
    examFeesCovered: boolean;
    examFeesCoveredLine: string;
    registration: { statusConfirmed: boolean; placeholder: string };
    upfront: { statusConfirmed: boolean; placeholder: string };
    earlyBird: {
      seats: number;
      closesLabel: string;
      closesAt: string;
      amountConfirmed: boolean;
      placeholder: string;
      displayLine: string;
    };
    sponsorSeat: { statusConfirmed: boolean; placeholder: string };
  };
  core: { title: string; subtitle: string; modules: CourseModule[] };
  pathways: Pathway[];
  paymentOptions: PaymentOptionConfig[];
  paymentMethodsNote: string;
  sponsor: { enquiryHref: string; note: string };
}

export const courses = raw as unknown as CoursesConfig;

export const fees = courses.fees;

export function getPathway(id: string): Pathway | undefined {
  return courses.pathways.find((pathway) => pathway.id === id);
}

export function isPathwayId(value: unknown): value is PathwayId {
  return typeof value === 'string' && (PATHWAY_IDS as readonly string[]).includes(value);
}

/** The tuition line every page quotes for a pathway. */
export function tuitionLine(pathway: Pathway): string {
  return `${formatRand(pathway.tuition.monthly)} a month for ${pathway.tuition.months} months (${formatRand(pathway.tuition.total)} in total)`;
}

/** Deterministic thousands grouping, so prices never reformat oddly by locale. */
export function formatRand(amount: number): string {
  const rounded = Math.round(amount);
  const negative = rounded < 0;
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${courses.currencySymbol}${grouped}`;
}

export function earlyBirdSeatsRemaining(paidCount: number): number {
  const remaining = fees.earlyBird.seats - Math.max(0, Math.trunc(paidCount));
  return remaining > 0 ? remaining : 0;
}

export function earlyBirdClosesAt(): Date {
  return new Date(fees.earlyBird.closesAt);
}

export function isEarlyBirdOpen(now: Date = new Date()): boolean {
  return now.getTime() < earlyBirdClosesAt().getTime();
}

export function pathwayName(id: string): string {
  return getPathway(id)?.name ?? 'Pathway to be confirmed';
}

/** Only ever rendered when the client has approved the ranges for display. */
export function salaryRangeLine(pathway: Pathway): string | null {
  if (!courses.salaryRangesApprovedForDisplay) return null;
  return `${formatRand(pathway.salaryRange.min)} - ${formatRand(pathway.salaryRange.max)} a month`;
}
