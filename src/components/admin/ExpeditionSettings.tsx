import { SearchIcon, MapPinIcon, PackageIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

import { AlertTriangleIcon, LoaderCircleIcon, RefreshCwIcon, SaveIcon, ShieldCheckIcon, TruckIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { INDONESIAN_PROVINCES } from '../../lib/province';

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

const courierNames: Record<string, string> = {
  JNE: 'JNE Express',
  SiCepat: 'SiCepat Ekspres',
  'J&T': 'J&T Express',
  SAP: 'SAP Express',
  Ninja: 'Ninja Xpress',
  Anteraja: 'Anteraja',
  Lion: 'Lion Parcel',
  IDexpress: 'ID Express',
  Paxel: 'Paxel',
  Pos: 'Pos Indonesia',
};

const courierLogos: Record<string, string> = {
  JNE: 'https://ui-avatars.com/api/?name=JNE&background=024ca3&color=fff&bold=true',
  SiCepat: 'https://ui-avatars.com/api/?name=SiCepat&background=d81b23&color=fff&bold=true',
  'J&T': 'https://ui-avatars.com/api/?name=J&T&background=dd1a21&color=fff&bold=true',
  SAP: 'https://ui-avatars.com/api/?name=SAP&background=2c3e50&color=fff&bold=true',
  Ninja: 'https://ui-avatars.com/api/?name=Ninja&background=c2002f&color=fff&bold=true',
  Anteraja: 'https://ui-avatars.com/api/?name=Anteraja&background=ff3b83&color=fff&bold=true',
  Lion: 'https://ui-avatars.com/api/?name=Lion&background=e20613&color=fff&bold=true',
  IDexpress: 'https://ui-avatars.com/api/?name=ID&background=004f98&color=fff&bold=true',
  Paxel: 'https://ui-avatars.com/api/?name=Paxel&background=42155e&color=fff&bold=true',
  Pos: 'https://ui-avatars.com/api/?name=Pos&background=f07421&color=fff&bold=true',
};


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
  const [provinceSearch, setProvinceSearch] = useState('');

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
      const name = courierNames[c.courierCode] || c.courierCode;
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

  const filteredProvinces = useMemo(() => {
    return INDONESIAN_PROVINCES.filter((p) =>
      p.name.toLowerCase().includes(provinceSearch.toLowerCase()) || p.code.toLowerCase().includes(provinceSearch.toLowerCase())
    );
  }, [provinceSearch]);

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
      toast.success(`${courierNames[courier.courierCode] || courier.courierCode} diperbarui`);
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

  const togglePolicyProvince = (code: string) => {
    setPolicyCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  };

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
    return <section className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm" role="alert"><AlertTriangleIcon className="mx-auto size-8 text-rose-600" aria-hidden="true" /><h2 className="mt-4 text-lg font-black text-slate-950">Ekspedisi gagal dimuat</h2><p className="mt-2 text-sm text-slate-600">{loadError}</p><button type="button" onClick={() => void load()} className="btn-primary mt-5 min-h-11 px-5 text-xs"><RefreshCwIcon className="size-4" aria-hidden="true" /> Coba lagi</button></section>;
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ringkasan ekspedisi">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-600"><PackageIcon className="size-6" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Ekspedisi</p><p className="text-2xl font-black text-slate-950">{metrics.total}</p></div>
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><TruckIcon className="size-6" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ekspedisi Aktif</p><p className="text-2xl font-black text-slate-950">{metrics.active}</p></div>
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-sky-50 text-sky-600"><ShieldCheckIcon className="size-6" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Support COD</p><p className="text-2xl font-black text-slate-950">{metrics.cod}</p></div>
          </div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-rose-50 text-rose-600"><MapPinIcon className="size-6" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Non-COD Prov</p><p className="text-2xl font-black text-slate-950">{metrics.nonCodProvinces}</p></div>
          </div>
        </article>
      </section>

      {/* Non-COD Policy */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-950">Kebijakan Wilayah Khusus Non-COD</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Pilih provinsi yang tidak boleh menggunakan COD. Kebijakan toko ini terpisah dari pembatasan provinsi milik masing-masing ekspedisi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void savePolicy()}
            disabled={!policyChanged || policyPending}
            className="btn-primary min-h-11 shrink-0 px-5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {policyPending ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" /> : <SaveIcon className="size-4" aria-hidden="true" />}
            Simpan kebijakan
          </button>
        </div>
        
        <div className="mt-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleCheckRegion(PROVINCE_REGIONS.find((r) => r.name === 'Jawa')?.codes || [])}>Pilih Semua Jawa</Button>
              <Button type="button" variant="outline" size="sm" onClick={handleCheckAllOutsideJava}>Pilih Semua Luar Jawa</Button>
              <Button type="button" variant="outline" size="sm" onClick={handleResetProvinces}>Reset Pilihan</Button>
            </div>
            <div className="relative max-w-xs w-full">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input type="text" placeholder="Cari provinsi..." value={provinceSearch} onChange={(e) => setProvinceSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PROVINCE_REGIONS.map((region) => {
              const visibleCodes = region.codes.filter(c => filteredProvinces.some(p => p.code === c));
              if (visibleCodes.length === 0) return null;
              return (
                <div key={region.name} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{region.name}</h3>
                  </div>
                  <div className="space-y-2">
                    {visibleCodes.map((code) => {
                      const province = INDONESIAN_PROVINCES.find(p => p.code === code);
                      if (!province) return null;
                      const isExcluded = policyCodes.includes(code);
                      return (
                        <label key={code} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${isExcluded ? 'border-rose-200 bg-rose-50/50 text-rose-900' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                          <input
                            type="checkbox"
                            checked={isExcluded}
                            onChange={() => togglePolicyProvince(code)}
                            disabled={policyPending}
                            className="size-4 rounded border-slate-300 text-rose-600 focus:ring-rose-600"
                          />
                          <span className="min-w-0 flex-1 font-semibold">{province.name}</span>
                          <span className="font-mono text-[10px] font-bold opacity-50">{province.code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Courier List */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 md:p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-950">Daftar Ekspedisi</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Layanan nonaktif tidak muncul di checkout. COD hanya muncul jika layanan dan COD sama-sama aktif.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button type="button" onClick={() => setCourierFilter('all')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${courierFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Semua</button>
              <button type="button" onClick={() => setCourierFilter('active')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${courierFilter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Aktif</button>
              <button type="button" onClick={() => setCourierFilter('non_cod')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${courierFilter === 'non_cod' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Non-COD</button>
            </div>
            <div className="relative max-w-xs w-full">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input type="text" placeholder="Cari ekspedisi..." value={courierSearch} onChange={(e) => setCourierSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100 p-5 md:p-6">
          {filteredCouriers.length === 0 ? (
             <div className="py-8 text-center text-sm text-slate-500">Tidak ada kurir yang cocok.</div>
          ) : filteredCouriers.map((courier) => {
            const enabled = Boolean(courier.isEnabled);
            const codEnabled = Boolean(courier.isCodEnabled);
            const restrictions = courier.excludedProvinces?.split(',').filter(Boolean).length ?? 0;
            const name = courierNames[courier.courierCode] || courier.courierCode;
            const logo = courierLogos[courier.courierCode];
            
            return (
              <article key={courier.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="hidden sm:block shrink-0 size-10 rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                    {logo ? <img src={logo} alt={name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-slate-300">{courier.courierCode[0]}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-slate-950">{name}</h3>
                      {enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500"></span>Aktif</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600"><span className="size-1.5 rounded-full bg-slate-400"></span>Nonaktif</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{restrictions > 0 ? <span className="text-rose-600 font-semibold">{restrictions} provinsi tanpa COD</span> : 'Mendukung semua provinsi COD'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:w-56 shrink-0 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="flex flex-col justify-center gap-1.5"><span className="text-[10px] font-black uppercase text-slate-500">Layanan</span><Toggle checked={enabled} disabled={Boolean(pending)} pending={pending === `${courier.id}-enabled`} label={`Layanan ${courier.courierCode}`} onChange={() => void toggle(courier, 'enabled')} /></div>
                  <div className="flex flex-col justify-center gap-1.5"><span className="text-[10px] font-black uppercase text-slate-500">COD</span><Toggle checked={codEnabled} disabled={Boolean(pending) || !enabled} pending={pending === `${courier.id}-cod`} label={`COD ${courier.courierCode}`} onChange={() => void toggle(courier, 'cod')} /></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

    </div>
  );
}
