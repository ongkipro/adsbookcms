import { useEffect, useId, useState } from 'react';
import { CRM_STEPS } from './CrmActionButton';
import type { OrderFollowUp, OrderFollowUpStep } from '../../lib/order-follow-up';
import { Button, buttonVariants } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

const FOLLOW_UP_SAVED = 'adsbook:follow-up-saved';

export function CrmActionGroup({ orderId, crmUrls }: { orderId: string | number; crmUrls: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<OrderFollowUp[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ step: OrderFollowUpStep; completed: boolean; revision: number } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const noteId = useId();
  const endpoint = `/api/admin/orders/${encodeURIComponent(orderId)}/follow-up`;

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Catatan belum dapat dimuat.');
      if (!controller.signal.aborted) setRows(body.data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [expanded, endpoint, reload]);

  // OrdersTable mounts one group per layout (cards and table); a save in one
  // updates the other, so neither shows a stale status or revision.
  useEffect(() => {
    const sync = (event: Event) => {
      const { orderId: saved, row } = (event as CustomEvent<{ orderId: string; row: OrderFollowUp }>).detail;
      if (saved === String(orderId)) setRows(current => current && [...current.filter(item => item.step !== row.step), row]);
    };
    window.addEventListener(FOLLOW_UP_SAVED, sync);
    return () => window.removeEventListener(FOLLOW_UP_SAVED, sync);
  }, [orderId]);

  async function save() {
    if (!editing || saving || conflict) return;
    setSaving(true); setSaveError('');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editing, note }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 409) { setConflict(true); setReload(value => value + 1); return; } throw new Error(body.error || 'Gagal menyimpan catatan.'); }
      setRows(current => [...(current || []).filter(row => row.step !== editing.step), body.data]);
      window.dispatchEvent(new CustomEvent(FOLLOW_UP_SAVED, { detail: { orderId: String(orderId), row: body.data } }));
      setEditing(null);
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Gagal menyimpan catatan.'); }
    finally { setSaving(false); }
  }

  return <div className="flex min-w-0 flex-col gap-2">
    <Button variant="outline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Follow-up WA{rows && !error ? ` · ${rows.filter(row => row.completed).length}/${CRM_STEPS.length}` : ''}</Button>
    {expanded && <>
      <p className="text-xs text-muted-foreground">Buka WhatsApp tidak menandai selesai. Catat setelah follow-up dilakukan; bukan bukti pesan terkirim atau dibaca.</p>
      <Button variant="ghost" disabled={loading} onClick={() => setReload(value => value + 1)}>Muat ulang status</Button>
      {loading ? <p role="status">Memuat catatan…</p> : error ? <p role="alert">{error}</p> : rows && <div className="flex flex-col gap-3">{CRM_STEPS.map(step => {
        const row = rows.find(item => item.step === step.key);
        return <div key={step.key} className="flex min-w-0 flex-col gap-2 border-t border-border pt-3">
          <p className="text-sm font-medium">{step.fullLabel} · {row?.completed ? 'Sudah dilakukan' : 'Belum dilakukan'}</p>
          {row && <p className="break-words text-xs text-muted-foreground">{row.completed ? 'Dicatat' : 'Dikoreksi'} {new Date(row.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB oleh {row.updated_by}{row.note ? ` · ${row.note}` : ''}</p>}
          <div className="flex flex-wrap gap-2">
            {crmUrls[step.key] && <a className={buttonVariants({ variant: 'outline' })} href={crmUrls[step.key]} target="_blank" rel="noopener noreferrer" aria-label={`Buka WhatsApp ${step.fullLabel}`}>Buka WhatsApp</a>}
            <Button variant="outline" onClick={() => { setEditing({ step: step.key, completed: !row?.completed, revision: row?.revision ?? 0 }); setNote(''); setSaveError(''); setConflict(false); }}>{row?.completed ? 'Koreksi ke belum' : 'Tandai selesai'}</Button>
          </div>
        </div>;
      })}</div>}
    </>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null); }}><DialogContent>
      <DialogHeader><DialogTitle>{editing?.completed ? 'Konfirmasi follow-up selesai' : 'Koreksi status follow-up'}</DialogTitle><DialogDescription>{CRM_STEPS.find(step => step.key === editing?.step)?.fullLabel} · Simpan hanya setelah tindakan benar-benar dilakukan. Identitas operator dan waktu akan dicatat.</DialogDescription></DialogHeader>
      <label htmlFor={noteId}>{editing?.completed ? 'Catatan (opsional)' : 'Alasan koreksi (wajib)'}</label>
      <Textarea id={noteId} maxLength={1000} value={note} disabled={saving} onChange={event => setNote(event.target.value)} />
      {saveError && <p role="alert">{saveError}</p>}
      {conflict && <p className="text-sm">Status terbaru sudah dimuat ulang. Tutup dialog dan periksa sebelum mencatat lagi. Catatan Anda: {note || '—'}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Batal</Button><Button disabled={saving || conflict || (!editing?.completed && !note.trim())} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan konfirmasi'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
