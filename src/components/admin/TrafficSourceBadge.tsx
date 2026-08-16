import { parseTrafficSource } from '../../lib/traffic-source';

export function TrafficSourceBadge({
  adClickIds,
  size = 'sm',
  className = '',
}: {
  adClickIds?: string | null;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const source = parseTrafficSource(adClickIds);

  const sizeClasses =
    size === 'xs'
      ? 'px-2 py-0.5 text-[9px]'
      : 'px-2.5 py-1 text-[10px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-full border transition-colors ${sizeClasses} ${source.badgeClass} ${className}`}
      title={
        source.details.utm_campaign
          ? `Campaign: ${source.details.utm_campaign}`
          : source.label
      }
    >
      <span className="size-1.5 rounded-full bg-current opacity-80 shrink-0" />
      <span>{source.label}</span>
    </span>
  );
}
