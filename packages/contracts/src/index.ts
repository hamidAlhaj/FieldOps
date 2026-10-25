import { z } from 'zod';
export const healthResponseSchema = z.object({ status: z.literal('ok'), service: z.literal('fieldops-api') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
