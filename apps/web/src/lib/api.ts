import { healthResponseSchema } from '@fieldops/contracts';
export async function getHealth(signal?: AbortSignal) {
 const response = await fetch('/api/v1/health', { signal });
 if (!response.ok) throw new Error('تعذر الاتصال بالخادم');
 return healthResponseSchema.parse(await response.json());
}
