import { describe, expect, it } from 'vitest';

import {
  buildFilename,
  formatDatePart,
  formatTimePart,
  sanitizeFilename,
} from '../src/pdf/filename';

// Local time so the date parts are stable regardless of the machine's zone.
const WHEN = new Date(2026, 8, 29, 14, 5, 0);

const context = { subject: 'Maths HW', date: WHEN, count: 12 };

describe('formatDatePart / formatTimePart', () => {
  it('pads to a sortable, filename-safe form', () => {
    expect(formatDatePart(WHEN)).toBe('2026-09-29');
    expect(formatTimePart(WHEN)).toBe('1405');
  });
});

describe('sanitizeFilename', () => {
  it('strips characters a filesystem or share sheet would reject', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('collapses whitespace and repeated separators', () => {
    expect(sanitizeFilename('Maths   HW   page')).toBe('Maths_HW_page');
    expect(sanitizeFilename('a___b')).toBe('a_b');
  });

  it('removes control characters and leading/trailing dots', () => {
    expect(sanitizeFilename('...scan\u0000\u001f')).toBe('scan');
  });

  it('caps the length so the whole path stays legal', () => {
    expect(sanitizeFilename('x'.repeat(400)).length).toBe(120);
  });
});

describe('buildFilename', () => {
  it('expands the default template', () => {
    expect(buildFilename('{subject}_{date}', context)).toBe('Maths_HW_2026-09-29.pdf');
  });

  it('expands every token', () => {
    expect(buildFilename('{subject}_{date}_{time}_{count}', context)).toBe(
      'Maths_HW_2026-09-29_1405_12.pdf',
    );
  });

  it('always ends in exactly one .pdf', () => {
    expect(buildFilename('report.pdf', context)).toBe('report.pdf');
    expect(buildFilename('{subject}.pdf', context)).toBe('Maths_HW.pdf');
    expect(buildFilename('{subject}', context).endsWith('.pdf')).toBe(true);
  });

  it('falls back when the subject or the template is empty', () => {
    expect(buildFilename('{subject}_{date}', { ...context, subject: '' })).toBe(
      'Scan_2026-09-29.pdf',
    );
    expect(buildFilename('', context)).toBe('Maths_HW_2026-09-29.pdf');
    expect(buildFilename('   ', context)).toBe('Scan.pdf');
    expect(buildFilename('///', context)).toBe('Scan.pdf');
  });

  it('survives a subject full of illegal characters', () => {
    const name = buildFilename('{subject}', { ...context, subject: 'a/b:c*d?' });
    expect(name).toBe('abcd.pdf');
  });

  it('keeps a usable name for an absurd template', () => {
    const name = buildFilename('{subject}'.repeat(50), context);
    expect(name.length).toBeLessThanOrEqual(124);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('does not double up separators when the subject has spaces', () => {
    expect(buildFilename('{subject} {count}', { ...context, subject: 'Bio lab' })).toBe(
      'Bio_lab_12.pdf',
    );
  });
});
