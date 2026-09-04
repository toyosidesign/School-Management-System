/**
 * What makes a support record a SEN plan.
 *
 * Support can be written for any pupil: a note that they sit near the front is
 * worth keeping and is nobody's business but the classroom's. A record only
 * reaches the SEN register once it names a need or grants an entitlement, so a
 * pupil who turns out to need one is on the register the moment it is written
 * rather than waiting for somebody to add them there a second time.
 *
 * A SQL fragment rather than a helper because every caller asks it of a whole
 * table at once. It expects the `iep_profiles` row to be joined as `iep`.
 */
export const IS_SEN = `(COALESCE(iep.needs, '[]') NOT IN ('[]', '') OR iep.time_multiplier > 1
                        OR iep.multi_format_approved = 1 OR iep.scribe_allowed = 1 OR iep.rest_breaks = 1)`;

export const NEED_KEYS = ['dyslexia', 'adhd', 'asc', 'dyscalculia', 'motor'];

export const yes = (v) => ['1', 'true', 'yes', 'y', 'approved', 'allowed']
  .includes(String(v ?? '').trim().toLowerCase());

/**
 * The support columns a school may put beside a pupil, read the same way
 * wherever they turn up: on their own in a file the SENCO keeps, or in the
 * enrolment file itself. A school that records support as it enrols should not
 * have to keep a second list to say the same thing.
 */
export function readSupport(row) {
  const value = (k) => (row[k] == null ? '' : String(row[k]).trim());
  const out = {
    needs: value('needs').split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean),
    multi_format: yes(row.multi_format),
    scribe_allowed: yes(row.scribe),
    rest_breaks: yes(row.rest_breaks),
    review_date: value('review_date'),
    notes: value('support_notes') || value('notes'),
    errors: [],
    warnings: [],
  };

  const unknown = out.needs.filter((n) => !NEED_KEYS.includes(n));
  if (unknown.length) {
    out.warnings.push(`Not a recognised need: ${unknown.join(', ')}`);
    out.needs = out.needs.filter((n) => NEED_KEYS.includes(n));
  }

  const raw = value('extra_time').replace(/^x/i, '');
  const percent = raw.endsWith('%');
  const number = Number(percent ? raw.slice(0, -1) : raw);

  if (!raw) out.time_multiplier = 1;
  else if (Number.isNaN(number)) {
    // Silently reading "lots" as standard time would quietly deny a pupil
    // the extra time somebody meant to give them.
    out.errors.push(`Extra time of "${value('extra_time')}" is not a number`);
    out.time_multiplier = 1;
  } else {
    out.time_multiplier = percent ? 1 + number / 100 : number;
    if (out.time_multiplier < 1 || out.time_multiplier > 3) {
      out.errors.push(`Extra time of "${value('extra_time')}" does not read as a multiplier`);
    }
  }

  if (out.review_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.review_date)) {
    out.errors.push('A review date should be written 2027-01-15');
  }

  out.is_sen = !!(out.needs.length || out.time_multiplier > 1 || out.multi_format
                  || out.scribe_allowed || out.rest_breaks);
  out.has_support = out.is_sen || !!out.notes;
  return out;
}
