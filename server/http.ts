import type { ZodType } from 'zod';
import { ApiError } from './utils.js';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(400, issue?.message || 'Please check the information you entered.', result.error.issues);
  }
  return result.data;
}

export function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}
