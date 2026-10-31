/**
 * Converts zod issues into { field: message } keeping the first message per field.
 * @param {import('zod').ZodError} error
 * @returns {Record<string, string>}
 */
export function issuesToFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0] ?? 'form';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
