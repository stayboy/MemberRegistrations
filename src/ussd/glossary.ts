/**
 * The code-owned display glossary. Every static USSD string comes from here:
 * `full` is for the web and admin portal, `short` is what the handset shows.
 * Dynamic values (names, amounts, dates, references) never live here.
 *
 * The table is the one reviewed in `documents/specs/member-registrations-ussd.md`.
 * Keys are stable so a later locale can add variants; wording changes are
 * spec-first.
 */
export const GLOSSARY = {
  'menu.offerings': { full: 'Offerings', short: 'Offerings' },
  'menu.activities': { full: 'Activities', short: 'Activities' },
  'menu.attendance': { full: 'Attendance', short: 'Attendance' },
  'menu.welfare': { full: 'Welfare & Services', short: 'Welfare' },
  'menu.profile': { full: 'My Profile', short: 'Profile' },
  'menu.register': { full: 'Register', short: 'Register' },
  'menu.exit': { full: 'Exit', short: 'Exit' },
  'nav.back': { full: 'Back', short: 'Back' },
  'nav.more': { full: 'More', short: 'More' },
  'nav.main': { full: 'Main menu', short: 'Main' },
  'action.give': { full: 'Give', short: 'Give' },
  'action.pledge': { full: 'Pledge', short: 'Pledge' },
  'action.my_pledges': { full: 'My pledges', short: 'Pledges' },
  'action.my_payments': { full: 'My payments', short: 'Payments' },
  'action.redeem': { full: 'Redeem', short: 'Redeem' },
  'action.accept': { full: 'Accept', short: 'Accept' },
  'action.change': { full: 'Change', short: 'Change' },
  'action.pay': { full: 'Pay', short: 'Pay' },
  'action.yes': { full: 'Yes', short: 'Yes' },
  'action.no': { full: 'No', short: 'No' },
  'prompt.amount': { full: 'Enter amount', short: 'Amount' },
  'prompt.offerings': { full: 'Choose offering(s)', short: 'Offering(s)' },
  'prompt.split': { full: 'Split amount', short: 'Split' },
  'prompt.date': { full: 'Enter date DDMMYYYY', short: 'Date (DDMMYYYY)' },
  'prompt.expected_date': { full: 'Expected date', short: 'Due date' },
  'prompt.phone': { full: 'Enter phone number', short: 'Phone' },
  'prompt.code': { full: 'Enter code', short: 'Code' },
  'prompt.name': { full: 'Enter name', short: 'Name' },
  'label.total': { full: 'Total', short: 'Total' },
  'label.reference': { full: 'Reference', short: 'Ref' },
  'label.code': { full: 'Confirmation code', short: 'Code' },
  'label.event': { full: 'Event', short: 'Event' },
  'label.day': { full: 'Day', short: 'Day' },
  'label.offering': { full: 'Offering', short: 'Offering' },
  'label.amount': { full: 'Amount', short: 'Amount' },
  'label.currency': { full: 'Currency', short: 'Currency' },
  'label.attended': { full: 'Attended', short: 'Present' },
  'label.expected_count': { full: 'Expected', short: 'Expected' },
  'label.male': { full: 'Male', short: 'Male' },
  'label.female': { full: 'Female', short: 'Female' },
  'label.children': { full: 'Children', short: 'Children' },
  'label.month': { full: 'This month', short: 'Month' },
  'prompt.reason': { full: 'Enter reason', short: 'Reason' },
  'status.registered': { full: 'Registration sent', short: 'Registered' },
  'status.attendance_recorded': { full: 'Attendance recorded', short: 'Recorded' },
  'error.code_invalid': { full: 'Invalid code', short: 'Bad code' },
  'error.code_used': { full: 'Code already used', short: 'Code used' },
  'error.not_shepherd': { full: 'Not your member', short: 'Not yours' },
  'error.not_senior': { full: 'Not a senior presbyter', short: 'Not senior' },
  'error.delegate_required': { full: 'Delegate first', short: 'Delegate' },
  'error.already_clocked': { full: 'Already clocked in', short: 'Clocked' },
  'activities.today': { full: 'Today', short: 'Today' },
  'activities.this_week': { full: 'This week', short: 'This week' },
  'activities.a_date': { full: 'A date', short: 'Date' },
  'activities.summary': { full: 'Attendance summary', short: 'Attendance' },
  'activities.give': { full: 'Give to an offering', short: 'Give' },
  'attendance.day': { full: 'A specific day', short: 'Day' },
  'attendance.period': { full: 'Period summary', short: 'Period' },
  'attendance.present': { full: 'I was present', short: 'Present' },
  'attendance.clocking': { full: 'Clocking', short: 'Clock' },
  'attendance.clock_in': { full: 'Clock in', short: 'Clock in' },
  'attendance.expected': { full: 'Expected', short: 'Expected' },
  'attendance.delegate': { full: 'Delegate', short: 'Delegate' },
  'attendance.no_data': { full: 'No attendance yet', short: 'No attendance' },
  'status.regular': { full: 'Regular', short: 'Regular' },
  'status.non_regular': { full: 'Non-Regular', short: 'Non-reg' },
  'status.not_enough_data': { full: 'Not enough data', short: 'No data' },
  'welfare.my_services': { full: 'My services', short: 'My plans' },
  'welfare.subscribe': { full: 'Subscribe', short: 'Join' },
  'welfare.eligible': { full: 'Eligible', short: 'Eligible' },
  'welfare.not_eligible': { full: 'Not eligible', short: 'Not eligible' },
  'welfare.premium': { full: 'Premium', short: 'Premium' },
  'welfare.payer_member': { full: 'You pay', short: 'You pay' },
  'welfare.payer_church': { full: 'Church pays', short: 'Church' },
  'welfare.paid_by_church': { full: 'Paid by the church', short: 'Church' },
  'welfare.cover': { full: 'Cover', short: 'Cover' },
  'welfare.claimed': { full: 'Total claimed', short: 'Claimed' },
  'welfare.expired': { full: 'Expired', short: 'Expired' },
  'welfare.until': { full: 'Until', short: 'Until' },
  'welfare.cover_dependents': { full: 'Cover dependents? 1 Yes 2 No', short: 'Dependents?' },
  'welfare.no_dependents': { full: 'No dependents', short: 'None' },
  'welfare.no_services': { full: 'No services', short: 'None' },
  'label.spouse_husband': { full: 'Husband', short: 'Husband' },
  'label.spouse_wife': { full: 'Wife', short: 'Wife' },
  'profile.member_no': { full: 'Member no.', short: 'Member no.' },
  'profile.gender': { full: 'Gender', short: 'Gender' },
  'profile.age': { full: 'Age', short: 'Age' },
  'profile.dob': { full: 'Date of birth', short: 'DOB' },
  'profile.ministries': { full: 'Ministries', short: 'Ministries' },
  'profile.shepherd': { full: 'Shepherd', short: 'Shepherd' },
  'profile.not_assigned': { full: 'Not assigned', short: 'Not assigned' },
  'error.session_expired': { full: 'Session expired', short: 'Session expired' },
  'error.too_many_tries': { full: 'Too many attempts', short: 'Too many tries' },
  'error.invalid_amount': { full: 'Invalid amount', short: 'Bad amount' },
  'error.invalid_date': { full: 'Invalid date', short: 'Bad date' },
  'error.invalid_choice': { full: 'Invalid choice', short: 'Invalid' },
  'error.one_offering': { full: 'Choose one offering', short: 'One only' },
  'error.no_event': { full: 'No event today', short: 'No event' },
  'error.no_offering': { full: 'No offerings today', short: 'No offering' },
  'error.officer_required': { full: 'No follow-up officer', short: 'No officer' },
  'error.no_pledges': { full: 'No pending pledges', short: 'No pledges' },
  'status.payment_pending': { full: 'Payment pending', short: 'Pending' },
  'label.week': { full: 'This week', short: 'Week' },
  'label.quarter': { full: 'This quarter', short: 'Quarter' },
  'label.year': { full: 'This year', short: 'Year' },
  'error.not_eligible': { full: 'Not eligible', short: 'Not eligible' },
  'error.already_paid': { full: 'Already paid', short: 'Already paid' },
  'error.try_again': { full: 'Try again', short: 'Try again' },
} as const satisfies Record<string, { full: string; short: string }>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Every key in the reviewed table, in table order. */
export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as GlossaryKey[];

/** The handset form. */
export function t(key: GlossaryKey): string {
  return GLOSSARY[key].short;
}

/** The web/admin form; no USSD screen uses it, the portal will. */
export function full(key: GlossaryKey): string {
  return GLOSSARY[key].full;
}
