export const slots = ['Morning', 'After breakfast', 'After lunch', 'After dinner'];
export function validateReading(body) {
  const errors = [];
  if (body.value === undefined || body.value === '') errors.push('Value is required');
  else if (!Number.isInteger(Number(body.value)) || Number(body.value) < 40 || Number(body.value) > 600) errors.push('Value must be a whole number between 40 and 600');
  if (!slots.includes(body.timeSlot)) errors.push('Choose a valid time slot');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || new Date(`${body.date}T00:00:00`) > new Date(new Date().toDateString())) errors.push('Date cannot be in the future');
  return errors;
}
