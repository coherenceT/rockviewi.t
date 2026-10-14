import { describe, expect, it } from 'vitest';
import { courses, earlyBirdSeatsRemaining, formatRand, getPathway, salaryRangeLine } from '../../shared/courses';
import { legal, programme, school } from '../../shared/config';

/**
 * A regression guard on the numbers and names the school gave.
 *
 * The brief said "use exactly these" for the fees and the modules, and said not
 * to invent prices, course content, legal wording or accreditation claims. These
 * assertions are what makes that enforceable: if someone edits a price or
 * renames a module, this test fails and has to be changed deliberately.
 */

describe('fees match the brief exactly', () => {
  it('monthly plan is R6,500 for 10 months, R65,000 in total', () => {
    expect(courses.fees.monthly.amount).toBe(6500);
    expect(courses.fees.monthly.months).toBe(10);
    expect(courses.fees.monthly.total).toBe(65000);
  });

  it('registration is a once-off R3,000', () => {
    expect(courses.fees.registration.amount).toBe(3000);
    expect(courses.fees.registration.onceOff).toBe(true);
  });

  it('the standard total is R68,000', () => {
    expect(courses.fees.standardTotal).toBe(68000);
    expect(courses.fees.monthly.total + courses.fees.registration.amount).toBe(courses.fees.standardTotal);
  });

  it('upfront is R64,000 in full, paid before 31 January 2027', () => {
    expect(courses.fees.upfront.amount).toBe(64000);
    expect(courses.fees.upfront.payBefore).toBe('2027-01-31');
  });

  it('early bird is R65,000 for the first 15 paid learners, closing 30 November 2026', () => {
    expect(courses.fees.earlyBird.amount).toBe(65000);
    expect(courses.fees.earlyBird.seats).toBe(15);
    expect(courses.fees.earlyBird.closesLabel).toBe('30 November 2026');

    // The closing instant is the start of 1 December in South African time, so
    // the countdown runs to the end of 30 November.
    const closes = new Date(courses.fees.earlyBird.closesAt);
    expect(closes.toISOString()).toBe('2026-11-30T22:00:00.000Z');
  });

  it('renders the early-bird line exactly as the brief specifies', () => {
    expect(courses.fees.earlyBird.displayLine).toBe(
      'Early bird: R65,000 total, first 15 paid learners only, closes 30 November 2026',
    );
  });

  it('sponsoring a seat is R68,000 per learner, as an enquiry', () => {
    expect(courses.fees.sponsorSeat.amount).toBe(68000);
    expect(courses.sponsor.amount).toBe(68000);
    expect(courses.sponsor.enquiryHref.startsWith('mailto:')).toBe(true);
    expect(courses.sponsor.note).toMatch(/enquiry only/i);
    expect(courses.sponsor.note).toMatch(/no payment/i);
  });

  it('keeps the unconfirmed claims switched off', () => {
    // VAT treatment, the early-bird basis and the salary ranges are all
    // awaiting confirmation, so none of them may be presented as settled.
    expect(courses.fees.vat.statusConfirmed).toBe(false);
    expect(courses.fees.vat.placeholder).toBe('[VAT treatment: TO BE CONFIRMED]');
    expect(courses.fees.earlyBird.amountBasisConfirmed).toBe(false);
    expect(courses.salaryRangesApprovedForDisplay).toBe(false);
  });

  it('surfaces the salary disclaimer with the ranges', () => {
    expect(courses.salaryNote).toBe('Planning ranges, not guaranteed outcomes.');
  });
});

describe('pathways and modules match the brief exactly', () => {
  const EXPECTED = {
    a: {
      name: 'Software, Web and Mobile Development',
      salary: { min: 15000, max: 25000 },
      modules: [
        'Web Foundations, UI and Responsive Design',
        'Programming with JavaScript and Git',
        'Full-Stack Applications and Databases',
        'Software Delivery Capstone and WIL',
      ],
    },
    b: {
      name: 'Cybersecurity and IT Support',
      salary: { min: 12000, max: 22000 },
      modules: [
        'IT Support, Operating Systems and Networking Basics',
        'Security Fundamentals and Defensive Practice',
        'Security Operations, Logs and Vulnerability Management',
        'SOC/Support Capstone and WIL',
      ],
    },
    c: {
      name: 'Data, Networking and Cloud Operations',
      salary: { min: 13000, max: 24000 },
      modules: [
        'Data Literacy, Spreadsheets and SQL',
        'Networking and Systems Operations',
        'Cloud Foundations, Automation and Security',
        'Data/Cloud Operations Capstone and WIL',
      ],
    },
  } as const;

  it('lists exactly three pathways, in order', () => {
    expect(courses.pathways.map((pathway) => pathway.id)).toEqual(['a', 'b', 'c']);
  });

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(`pathway ${id.toUpperCase()} has the published name, modules and planning range`, () => {
      const pathway = getPathway(id);
      expect(pathway).toBeDefined();
      expect(pathway!.name).toBe(expected.name);
      expect(pathway!.modules.map((module) => module.title)).toEqual([...expected.modules]);
      expect(pathway!.salaryRange.min).toBe(expected.salary.min);
      expect(pathway!.salaryRange.max).toBe(expected.salary.max);
    });

    it(`pathway ${id.toUpperCase()} has four modules across the two semesters`, () => {
      const pathway = getPathway(id)!;
      expect(pathway.modules).toHaveLength(4);
      expect(pathway.modules.filter((module) => module.semester === 1)).toHaveLength(2);
      expect(pathway.modules.filter((module) => module.semester === 2)).toHaveLength(2);
    });
  }

  it('does not publish a salary range while approval is outstanding', () => {
    for (const pathway of courses.pathways) {
      expect(salaryRangeLine(pathway)).toBeNull();
    }
  });

  it('does not invent pathway module descriptions', () => {
    for (const pathway of courses.pathways) {
      for (const module of pathway.modules) {
        expect(module.description).toBeNull();
      }
    }
  });

  it('has the four shared core modules, with the descriptions from the brief', () => {
    expect(courses.core.modules.map((module) => module.title)).toEqual([
      'Computer Literacy and Digital Work Habits',
      'Programming Logic and Quantitative Thinking',
      'Software Literacy and Collaboration',
      'Professional Practice, Technical Communication and Work-Integrated Learning',
    ]);

    for (const module of courses.core.modules) {
      expect(typeof module.description).toBe('string');
      expect((module.description ?? '').length).toBeGreaterThan(20);
    }

    expect(courses.core.modules.filter((module) => module.semester === 1)).toHaveLength(2);
    expect(courses.core.modules.filter((module) => module.semester === 2)).toHaveLength(2);
  });

  it('states 60 credit-equivalents', () => {
    expect(courses.creditEquivalents).toBe(60);
    expect(courses.core.subtitle).toContain('60 credit-equivalents');
  });

  it('offers the four payment options from the brief', () => {
    expect(courses.paymentOptions.map((option) => option.id)).toEqual([
      'monthly',
      'upfront',
      'early_bird',
      'sponsored',
    ]);
  });
});

describe('programme details match the brief exactly', () => {
  it('starts in February 2027 and runs for 10 months to November 2027', () => {
    expect(programme.startDate).toBe('2027-02-01');
    expect(programme.startLabel).toBe('February 2027');
    expect(programme.endLabel).toBe('November 2027');
    expect(programme.monthCount).toBe(10);
    expect(programme.deliveryMode).toBe('Full-time');
  });

  it('runs the schedule the brief describes', () => {
    expect(programme.schedule.morningCore).toBe('08:00-12:00, Monday to Friday');
    expect(programme.schedule.afternoonPathway).toBe('13:00-15:00, Monday to Thursday');
    expect(programme.schedule.friday).toMatch(/labs, assessments, work-integrated learning and career support/);
  });

  it('caps classes at 22 learners per lecturer', () => {
    expect(programme.maxLearnersPerLecturer).toBe(22);
  });

  it('is in Northdale, Pietermaritzburg, KwaZulu-Natal', () => {
    expect(school.location).toBe('Northdale, Pietermaritzburg, KwaZulu-Natal, South Africa');
  });
});

describe('unconfirmed wording stays a placeholder', () => {
  it('uses the school name as a placeholder and says so', () => {
    expect(school.name).toBe('IT Career Foundation School');
    expect(school.nameConfirmed).toBe(false);
  });

  it('marks contact details and the domain as unconfirmed', () => {
    expect(school.contact.confirmed).toBe(false);
    expect(school.domainConfirmed).toBe(false);
    // Nothing may point at a real address before the school supplies one.
    expect(school.contact.email).toMatch(/\.invalid$/);
  });

  it('uses exactly the accreditation placeholder from the brief', () => {
    expect(legal.accreditationPlaceholder).toBe('[Accreditation wording: TO BE CONFIRMED]');
    expect(legal.accreditationApproved).toBe(false);
  });

  it('does not describe the programme as accredited or as an NQF qualification', () => {
    const searchable = JSON.stringify({ courses, programme, school, legal });
    expect(searchable).not.toMatch(/is accredited/i);
    expect(searchable).not.toMatch(/accredited qualification/i);
    expect(searchable).not.toMatch(/\bNQF level\b/i);
    expect(legal.nqfWordingPlaceholder).toContain('TO BE CONFIRMED');
  });

  it('records the 5 year retention default and flags it as unconfirmed', () => {
    expect(legal.retentionYearsForRejectedApplications).toBe(5);
    expect(legal.retentionConfirmed).toBe(false);
  });

  it('labels the consent version as an unapproved draft', () => {
    expect(legal.popiaConsentVersion).toBe('draft-1-unapproved');
  });
});

describe('display helpers', () => {
  it('formats rand with thousands separators', () => {
    expect(formatRand(65000)).toBe('R65,000');
    expect(formatRand(6500)).toBe('R6,500');
    expect(formatRand(68000)).toBe('R68,000');
    expect(formatRand(0)).toBe('R0');
  });

  it('counts early-bird places down and never below zero', () => {
    expect(earlyBirdSeatsRemaining(0)).toBe(15);
    expect(earlyBirdSeatsRemaining(3)).toBe(12);
    expect(earlyBirdSeatsRemaining(15)).toBe(0);
    expect(earlyBirdSeatsRemaining(99)).toBe(0);
    expect(earlyBirdSeatsRemaining(-5)).toBe(15);
  });
});
