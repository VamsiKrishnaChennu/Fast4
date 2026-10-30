/**
 * Validates request parts with zod. Use `.strict()` objects so unknown keys are rejected.
 * Parsed values replace the originals so handlers only see validated data.
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const part of ['params', 'query', 'body']) {
        if (schemas[part]) req[part] = schemas[part].parse(req[part]);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
