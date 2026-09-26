import { Button } from '../ui/button';
import { SearchInput } from './filter-bar';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '../ui/combobox';

import { AlertTriangleIcon, LoaderCircleIcon, RefreshCwIcon, SaveIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { courierDisplayName } from '../../lib/courier-names';
import { INDONESIAN_PROVINCES } from '../../lib/province';

const PROVINCE_NAMES = new Map(INDONESIAN_PROVINCES.map((province) => [province.code, province.name]));
const provinceLabel = (code: string) => PROVINCE_NAMES.get(code) ?? code;

const PROVINCE_REGIONS = [
  {
    name: 'Jawa',
    codes: ['JK', 'JB', 'JT', 'YO', 'JI', 'BT'],
  },
  {
    name: 'Sumatra',
    codes: ['AC', 'SU', 'SB', 'RI', 'JA', 'SS', 'BE', 'LA', 'BB', 'KR'],
  },
  {
    name: 'Kalimantan',
    codes: ['KB', 'KT', 'KS', 'KI', 'KU'],
  },
  {
    name: 'Sulawesi',
    codes: ['SA', 'ST', 'SN', 'SG', 'GO', 'SR'],
  },
  {
    name: 'Nusa Tenggara & Bali',
    codes: ['BA', 'NB', 'NT'],
  },
  {
    name: 'Maluku & Papua',
    codes: ['MA', 'MU', 'PA', 'PB', 'PD', 'PE', 'PS', 'PT'],
  },
];

type CourierRule = {
  id: number;
  courierCode: string;
  isEnabled: number;
  isCodEnabled: number;
  excludedProvinces: string | null;
};

// Courier marks served from this install (`public/images/couriers`); a courier
// without one falls back to its initials on its brand colour.
const courierLogos: Record<string, string> = {
  JNE: '/images/couriers/jne.webp',
  SiCepat: '/images/couriers/sicepat.svg',
  'J&T': '/images/couriers/jt.webp',
  SAP: '/images/couriers/sap.webp',
  Anteraja: '/images/couriers/anteraja.webp',
  Lion: '/images/couriers/lion.webp',
  IDexpress: '/images/couriers/idexpress.webp',
  Pos: '/images/couriers/pos.svg',
  SPX: '/images/couriers/spx.svg',
};
const courierColors: Record<string, string> = { Paxel: '#42155e', Ninja: '#c2002f' };


function Toggle({ checked, disabled, pending, label, onChange }: {
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {pending && <LoaderCircleIcon className="size-4 animate-spin text-slate-400" aria-hidden="true" />}
      <Switch
        checked={checked}
        disabled={disabled || pending}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}
export function ExpeditionSettings() {
  const [couriers, setCouriers] = useState<CourierRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState('');
  const [policyCodes, setPolicyCodes] = useState<string[]>([]);
  const [savedPolicyCodes, setSavedPolicyCodes] = useState<string[]>([]);
  const [policyPending, setPolicyPending] = useState(false);

  // Filter & Search states
  const [courierSearch, setCourierSearch] = useState('');
  const [courierFilter, setCourierFilter] = useState<'all' | 'active' | 'non_cod'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/expeditions', { headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Gagal memuat ekspedisi.');
      setCouriers(payload.data.couriers as CourierRule[]);
      const loadedPolicy = Array.isArray(payload.data.codDisabledProvinceCodes)
        ? payload.data.codDisabledProvinceCodes as string[]
        : [];
      setPolicyCodes(loadedPolicy);
      setSavedPolicyCodes(loadedPolicy);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Gagal memuat ekspedisi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    total: couriers.length,
    active: couriers.filter((c) => Boolean(c.isEnabled)).length,
    cod: couriers.filter((c) => Boolean(c.isEnabled) && Boolean(c.isCodEnabled)).length,
    nonCodProvinces: policyCodes.length,
  }), [couriers, policyCodes]);

  const filteredCouriers = useMemo(() => {
    return couriers.filter((c) => {
      const name = courierDisplayName(c.courierCode);
      const matchesSearch = name.toLowerCase().includes(courierSearch.toLowerCase()) || c.courierCode.toLowerCase().includes(courierSearch.toLowerCase());
      const matchesFilter =
        courierFilter === 'all'
          ? true
          : courierFilter === 'active'
          ? Boolean(c.isEnabled)
          : courierFilter === 'non_cod'
          ? !Boolean(c.isCodEnabled)
          : true;
      return matchesSearch && matchesFilter;
    });
  }, [couriers, courierSearch, courierFilter]);

  const handleCheckRegion = (regionCodes: string[]) => {
    setPolicyCodes((prev) => Array.from(new Set([...prev, ...regionCodes])));
  };


  const handleCheckAllOutsideJava = () => {
    const javaCodes = PROVINCE_REGIONS.find((r) => r.name === 'Jawa')?.codes || [];
    const outsideJavaCodes = INDONESIAN_PROVINCES.map((p) => p.code).filter((c) => !javaCodes.includes(c));
    setPolicyCodes(outsideJavaCodes);
  };

  const handleResetProvinces = () => {
    setPolicyCodes([]);
  };

  const toggle = async (courier: CourierRule, field: 'enabled' | 'cod') => {
    const currentValue = field === 'enabled' ? Boolean(courier.isEnabled) : Boolean(courier.isCodEnabled);
    setPending(`${courier.id}-${field}`);
    try {
      const res = await fetch('/api/admin/expeditions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId: courier.id, field, value: !currentValue }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal menyimpan');

      setCouriers((prev) =>
        prev.map((c) => {
          if (c.id !== courier.id) return c;
          const next = { ...c, [field === 'enabled' ? 'isEnabled' : 'isCodEnabled']: !currentValue ? 1 : 0 };
          if (field === 'enabled' && !next.isEnabled) {
            next.isCodEnabled = 0;
          }
          return next;
        }),
      );
      toast.success(`${courierDisplayName(courier.courierCode)} diperbarui`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Terjadi kesalahan');
      await load();
    } finally {
      setPending('');
    }
  };

  const policyChanged =
    [...policyCodes].sort().join(',') !==
    [...savedPolicyCodes].sort().join(',');

  const savePolicy = async () => {
    setPolicyPending(true);
    try {
      const response = await fetch('/api/admin/expeditions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codDisabledProvinceCodes: policyCodes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Kebijakan wilayah COD gagal disimpan.');
      }
      const savedCodes = payload.data?.codDisabledProvinceCodes ?? policyCodes;
      setPolicyCodes(savedCodes);
      setSavedPolicyCodes(savedCodes);
      toast.success('Kebijakan wilayah COD disimpan', {
        description: payload.message,
      });
    } catch (error) {
      toast.error('Kebijakan wilayah COD gagal disimpan', {
        description:
          error instanceof Error
            ? error.message
            : 'Kebijakan wilayah COD gagal disimpan.',
      });
    } finally {
      setPolicyPending(false);
    }
  };

  if (loading) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Memuat pengaturan ekspedisi" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  }

  if (loadError) {
    return <section className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm" role="alert"><AlertTriangleIcon className="mx-auto size-8 text-rose-600" aria-hidden="true" /><h2 className="mt-4 text-base font-semibold text-slate-950">Ekspedisi gagal dimuat</h2><p className="mt-2 text-sm text-slate-600">{loadError}</p><button type="button" onClick={() => void load()} className="btn-primary mt-5"><RefreshCwIcon className="size-4" aria-hidden="true" /> Coba lagi</button></section>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600" aria-label="Ringkasan ekspedisi">
        <span className="font-semibold text-slate-950">{metrics.active}</span> dari {metrics.total} ekspedisi aktif ·{' '}
        <span className="font-semibold text-slate-950">{metrics.cod}</span> menerima COD ·{' '}
        <span className="font-semibold text-slate-950">{metrics.nonCodProvinces}</span> provinsi tanpa COD
      </p>

      {/* Non-COD Policy */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-950">Kebijakan Wilayah Khusus Non-COD</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Pilih provinsi yang tidak boleh menggunakan COD. Kebijakan toko ini terpisah dari pembatasan provinsi milik masing-masing ekspedisi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void savePolicy()}
            disabled={!policyChanged || policyPending}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {policyPending ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" /> : <SaveIcon className="size-4" aria-hidden="true" />}
            Simpan kebijakan
          </button>
        </div>
        
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleCheckRegion(PROVINCE_REGIONS.find((r) => r.name === 'Jawa')?.codes || [])} disabled={policyPending}>Pilih Semua Jawa</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCheckAllOutsideJava} disabled={policyPending}>Pilih Semua Luar Jawa</Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleResetProvinces} disabled={policyPending || policyCodes.length === 0}>Reset Pilihan</Button>
            <span className="ml-auto text-xs font-medium text-slate-500" aria-live="polite">
              {policyCodes.length === 0 ? 'COD aktif di semua provinsi' : `${policyCodes.length} provinsi tanpa COD`}
            </span>
          </div>

          <ProvincePicker
            value={policyCodes}
            onChange={setPolicyCodes}
            disabled={policyPending}
          />
        </div>
      </section>

      {/* Courier List */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 md:p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-950">Daftar Ekspedisi</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Layanan nonaktif tidak muncul di checkout. COD hanya muncul jika layanan dan COD sama-sama aktif.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button type="button" onClick={() => setCourierFilter('all')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${courierFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Semua</button>
              <button type="button" onClick={() => setCourierFilter('active')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${courierFilter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Aktif</button>
              <button type="button" onClick={() => setCourierFilter('non_cod')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${courierFilter === 'non_cod' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Non-COD</button>
            </div>
            <SearchInput className="w-full max-w-xs" aria-label="Cari ekspedisi" placeholder="Cari ekspedisi" value={courierSearch} onValueChange={setCourierSearch} />
          </div>
        </div>
        {filteredCouriers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Tidak ada kurir yang cocok.</p>
        ) : (
          // One card per courier, one line per card: the mark and name, then
          // the two switches. Coverage shows only when it is restricted.
          <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCouriers.map((courier) => {
              const enabled = Boolean(courier.isEnabled);
              const codEnabled = Boolean(courier.isCodEnabled);
              const restrictions = courier.excludedProvinces?.split(',').filter(Boolean).length ?? 0;
              const name = courierDisplayName(courier.courierCode);
              const logo = courierLogos[courier.courierCode];
              return (
                <li key={courier.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${enabled ? 'bg-white' : 'bg-slate-50'}`}>
                  <span className="grid h-8 w-11 shrink-0 place-items-center" aria-hidden="true">
                    {logo ? (
                      <img src={logo} alt="" className={`max-h-7 max-w-11 object-contain ${enabled ? '' : 'opacity-40 grayscale'}`} loading="lazy" />
                    ) : (
                      <span
                        className="grid size-7 place-items-center rounded-md text-xs font-semibold text-white"
                        style={{ backgroundColor: enabled ? courierColors[courier.courierCode] ?? '#64748b' : '#cbd5e1' }}
                      >
                        {courier.courierCode.slice(0, 3).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`truncate font-medium ${enabled ? 'text-slate-900' : 'text-slate-400'}`}>{name}</span>
                    {restrictions > 0 && (
                      <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700" title={`${restrictions} provinsi tanpa COD`}>
                        −{restrictions} prov
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    <label className="flex items-center gap-1.5">
                      Aktif
                      <Toggle checked={enabled} disabled={Boolean(pending)} pending={pending === `${courier.id}-enabled`} label={`Layanan ${name}`} onChange={() => void toggle(courier, 'enabled')} />
                    </label>
                    <label className="flex items-center gap-1.5">
                      COD
                      <Toggle checked={codEnabled} disabled={Boolean(pending) || !enabled} pending={pending === `${courier.id}-cod`} label={`COD ${name}`} onChange={() => void toggle(courier, 'cod')} />
                    </label>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}

/**
 * The store's non-COD provinces as one searchable multi-select, grouped by
 * island. It replaces 38 always-visible checkbox tiles; the chips are the
 * current policy at a glance, and typing searches by name or code.
 */
function ProvincePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const groups = PROVINCE_REGIONS.map((region) => ({ value: region.name, items: region.codes }));
  return (
    <div className="space-y-1.5">
      <label htmlFor="cod-province-picker" className="text-xs font-semibold text-slate-700">
        Provinsi tanpa COD
      </label>
      <Combobox
        multiple
        autoHighlight
        items={groups}
        value={value}
        onValueChange={(next) => onChange(next as string[])}
        itemToStringLabel={(code: string) => `${provinceLabel(code)} ${code}`}
        disabled={disabled}
      >
        <ComboboxChips ref={anchor} className="min-h-11 bg-white">
          <ComboboxValue>
            {(codes: string[]) => (
              <>
                {codes.map((code) => (
                  <ComboboxChip key={code} aria-label={provinceLabel(code)} removeLabel={`Hapus ${provinceLabel(code)}`}>
                    {provinceLabel(code)}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id="cod-province-picker"
                  placeholder={codes.length ? 'Tambah provinsi…' : 'Cari provinsi, misalnya Papua atau PA'}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>Provinsi tidak ditemukan.</ComboboxEmpty>
          <ComboboxList>
            {(group: { value: string; items: string[] }) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(code: string) => (
                    <ComboboxItem key={code} value={code}>
                      <span className="flex-1">{provinceLabel(code)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{code}</span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="text-xs text-slate-500">
        Pembeli dengan alamat di provinsi ini hanya bisa membayar online. Kebijakan ini terpisah dari batasan provinsi tiap ekspedisi di bawah.
      </p>
    </div>
  );
}

