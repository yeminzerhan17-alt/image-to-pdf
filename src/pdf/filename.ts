/**
 * Filename templating. Naming matters at submission time: a student handing in
 * "Maths_HW_2026-09-29.pdf" is better off than one handing in "IMG_0421.pdf".
 */

export interface FilenameContext {
  subject: string;
  date: Date;
  count: number;
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(ILLEGAL, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .replace(/[._]+$/, '');
  return cleaned.slice(0, 120);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatDatePart(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimePart(date: Date): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Expand {subject} {date} {time} {count} and always return a *.pdf name. */
export function buildFilename(template: string, context: FilenameContext): string {
  const expanded = (template || '{subject}_{date}')
    .replace(/\{subject\}/g, context.subject || 'Scan')
    .replace(/\{date\}/g, formatDatePart(context.date))
    .replace(/\{time\}/g, formatTimePart(context.date))
    .replace(/\{count\}/g, String(context.count));

  // Strip a trailing extension the user typed so we never produce "x.pdf.pdf".
  const base = sanitizeFilename(expanded).replace(/\.pdf$/i, '') || 'Scan';
  return `${base}.pdf`;
}
