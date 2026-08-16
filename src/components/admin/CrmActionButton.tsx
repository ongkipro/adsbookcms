import React from 'react';

export type CrmStepKey = 'welcome' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export interface CrmStepConfig {
  key: CrmStepKey;
  label: string;        // Short label (W, D, F1...)
  fullLabel: string;    // Full label (1. Welcome, 2. Detail...)
  mobileLabel: string;  // 5-col mobile label
  title: string;        // Full tooltip title
}

export const CRM_STEPS: CrmStepConfig[] = [
  { key: 'welcome', label: 'Welcome', fullLabel: 'Welcome', mobileLabel: 'Welcome', title: 'Welcome: Sapa & Konfirmasi Pesanan' },
  { key: '1', label: 'Detail', fullLabel: 'Detail', mobileLabel: 'Detail', title: 'Detail: Kirim Rincian Pesanan' },
  { key: '2', label: 'FU 1', fullLabel: 'FU 1', mobileLabel: 'FU 1', title: 'Follow Up 1: Ingatkan Pembayaran' },
  { key: '3', label: 'FU 2', fullLabel: 'FU 2', mobileLabel: 'FU 2', title: 'Follow Up 2: Tawaran Promo' },
  { key: '4', label: 'FU 3', fullLabel: 'FU 3', mobileLabel: 'FU 3', title: 'Follow Up 3: Edukasi Manfaat' },
  { key: '5', label: 'FU 4', fullLabel: 'FU 4', mobileLabel: 'FU 4', title: 'Follow Up 4: Tanya Kendala' },
  { key: '6', label: 'FU 5', fullLabel: 'FU 5', mobileLabel: 'FU 5', title: 'Follow Up 5: Terakhir' },
  { key: '7', label: 'Process', fullLabel: 'Process', mobileLabel: 'Process', title: 'Processing: Informasi Pengiriman' },
  { key: '8', label: 'Finish', fullLabel: 'Finish', mobileLabel: 'Finish', title: 'Completed: Paket Diterima' },
  { key: '9', label: 'Upsell', fullLabel: 'Upsell', mobileLabel: 'Upsell', title: 'UpSelling: Penawaran Varian Lain' },
];

interface CrmActionButtonProps {
  stepKey: CrmStepKey;
  label: string;
  fullLabel?: string;
  mobileLabel?: string;
  title: string;
  waUrl: string;
  isClicked: boolean;
  onClicked?: (key: CrmStepKey) => void;
  size?: 'sm' | 'md';
  variant?: 'full' | 'compact';
}

export const CrmActionButton: React.FC<CrmActionButtonProps> = ({
  stepKey,
  label,
  fullLabel,
  mobileLabel,
  title,
  waUrl,
  isClicked,
  onClicked,
  size = 'md',
  variant = 'full',
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!waUrl) {
      e.preventDefault();
      return;
    }
    if (onClicked) {
      onClicked(stepKey);
    }
  };

  const displayText = fullLabel || label;
  const displayMobile = mobileLabel || label;

  if (variant === 'compact') {
    const sizeClasses = size === 'sm'
      ? 'h-7 min-w-[28px] px-1.5 text-[11px]'
      : 'h-8 min-w-[32px] px-2 text-xs';

    return (
      <a
        href={waUrl || '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        title={title}
        className={`inline-flex items-center justify-center font-bold rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 ${sizeClasses} ${
          isClicked
            ? 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900'
            : 'bg-emerald-800 text-white hover:bg-emerald-900 focus:ring-emerald-800 shadow-xs'
        } ${!waUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {label}
      </a>
    );
  }

  return (
    <a
      href={waUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title={title}
      // h-11 below sm: this is an <a>, so the shell's `min-height: 2.75rem` mobile
      // rule (which only matches <button> and a.btn-*) never reached it and the ten
      // CRM steps were 32px tap targets on a phone.
      className={`inline-flex h-11 sm:h-8 items-center justify-between gap-1 rounded-lg px-2 text-xs font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
        isClicked
          ? 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-900 shadow-xs'
          : 'bg-emerald-800 text-white hover:bg-emerald-900 focus:ring-emerald-800 shadow-xs active:scale-[0.98]'
      } ${!waUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="hidden sm:inline truncate">{displayText}</span>
      <span className="inline sm:hidden truncate text-[10px]">{displayMobile}</span>
      {isClicked && (
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[9px] font-black text-slate-950">
          ✓
        </span>
      )}
    </a>
  );
};
