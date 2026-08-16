import React, { useState } from 'react';
import { CrmActionButton, CRM_STEPS, type CrmStepKey } from './CrmActionButton';

interface CrmActionGroupProps {
  crmUrls: Record<string, string>;
  clickedSteps: Record<string, boolean>;
  onStepClick: (stepKey: CrmStepKey) => void;
  size?: 'sm' | 'md';
  compact?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export const CrmActionGroup: React.FC<CrmActionGroupProps> = ({
  crmUrls,
  clickedSteps,
  onStepClick,
  size = 'md',
  compact = false,
  collapsible = true,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const clickedCount = Object.values(clickedSteps).filter(Boolean).length;
  const totalCount = CRM_STEPS.length;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {CRM_STEPS.map((step) => {
          const url = crmUrls[step.key] || '';
          const isClicked = Boolean(clickedSteps[step.key]);
          return (
            <CrmActionButton
              key={step.key}
              stepKey={step.key}
              label={step.label}
              fullLabel={step.fullLabel}
              mobileLabel={step.mobileLabel}
              title={step.title}
              waUrl={url}
              isClicked={isClicked}
              onClicked={onStepClick}
              size={size}
              variant="compact"
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={`group flex min-h-8 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all duration-150 ${
            expanded
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-xs'
              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-800'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <svg
              className="size-3.5 fill-current text-[#25D366]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12.031 0C5.394 0 0 5.394 0 12.031c0 2.124.553 4.197 1.604 6.02L.055 24l6.096-1.597C7.92 23.42 9.948 24 12.031 24c6.638 0 12.031-5.394 12.031-12.031C24.062 5.394 18.669 0 12.031 0zm6.812 17.062c-.282.796-1.411 1.488-2.28 1.637-.6.102-1.385.184-4.029-.912-3.376-1.398-5.545-4.839-5.714-5.064-.168-.225-1.378-1.832-1.378-3.497 0-1.665.867-2.484 1.176-2.822.31-.337.675-.422.9-.422.225 0 .45.003.647.012.21.009.492-.08.769.587.282.686.966 2.355 1.05 2.524.084.168.14.365.028.59-.112.225-.168.365-.337.562-.168.197-.354.44-.505.59-.168.168-.344.351-.148.687.197.337.876 1.446 1.883 2.343 1.294 1.152 2.385 1.51 2.722 1.678.337.168.534.14.731-.084.197-.225.843-.983 1.068-1.32.225-.337.45-.282.759-.168.31.112 1.967.927 2.304 1.096.337.168.562.253.647.394.085.141.085.825-.197 1.621z" />
            </svg>
            <span className="truncate">WA CRM</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black transition-colors ${
                clickedCount > 0
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {clickedCount}/{totalCount}
            </span>
            <svg
              className={`size-3.5 transition-transform duration-200 ${
                expanded ? 'rotate-180 text-emerald-700' : 'text-slate-400'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      )}

      {(!collapsible || expanded) && (
        // The breakpoints were inverted: `grid-cols-5 sm:grid-cols-2` gave a phone
        // five columns and a desktop two. At 360px each of the five tracks is
        // (310 - 24)/5 = 57px, while a CrmActionButton's min-content is ~74px
        // (px-2 + gap + the nowrap label + the clicked badge), so the row overflowed
        // by ~80px — clipped without a scroll path by the Card's own overflow-hidden
        // in OrderDetail. Two columns is what desktop already rendered.
        <div className="grid grid-cols-2 gap-1.5 w-full pt-1">
          {CRM_STEPS.map((step) => {
            const url = crmUrls[step.key] || '';
            const isClicked = Boolean(clickedSteps[step.key]);
            return (
              <CrmActionButton
                key={step.key}
                stepKey={step.key}
                label={step.label}
                fullLabel={step.fullLabel}
                mobileLabel={step.mobileLabel}
                title={step.title}
                waUrl={url}
                isClicked={isClicked}
                onClicked={onStepClick}
                size={size}
                variant="full"
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
