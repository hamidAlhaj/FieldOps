import { useEffect, useState } from 'react';
import { getHealth } from './lib/api';
export function App() {
 const [status, setStatus] = useState('جارٍ فحص الاتصال…');
 useEffect(() => { const controller = new AbortController(); getHealth(controller.signal).then(() => setStatus('الخادم متصل')).catch(() => { if (!controller.signal.aborted) setStatus('الخادم غير متاح'); }); return () => controller.abort(); }, []);
 return <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-16"><div className="mx-auto max-w-4xl"><p className="text-emerald-400 font-semibold">FieldOps · Stage 1</p><h1 className="mt-6 text-3xl md:text-5xl font-bold">إدارة العمليات الميدانية</h1><p className="mt-6 text-slate-300 leading-8">أساس النظام جاهز للتطوير. ستُضاف الطلبات والتكليفات وتتبع الفنيين في المراحل التالية.</p><section className="mt-10 rounded-2xl border border-slate-700 p-6" aria-label="حالة النظام"><h2 className="text-xl font-semibold">حالة API</h2><p className="mt-3" role="status">{status}</p></section></div></main>;
}
