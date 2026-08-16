let cloudflareEnv: Record<string, unknown> | undefined;
try {
  const mod = 'cloudflare:workers';
  const workers = await import(/* @vite-ignore */ mod);
  cloudflareEnv = workers.env;
} catch {
  // Fallback for non-Cloudflare environments (e.g. Node unit test runner)
}

type EnvSource = Record<string, unknown> | null | undefined;

function normalizeEnvValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  const normalized = String(value).trim();
  return normalized === '' ? '' : normalized;
}

export function getRuntimeEnv(locals?: App.Locals): EnvSource {
  const localEnv = (locals as { runtimeEnv?: Record<string, unknown> } | undefined)?.runtimeEnv;
  if (localEnv && typeof localEnv === 'object') {
    return localEnv;
  }
  return cloudflareEnv as unknown as Record<string, unknown>;
}

export function getEnvValue(key: string, env?: EnvSource) {
  const runtimeValue = normalizeEnvValue(env?.[key]);
  if (runtimeValue !== '') {
    return runtimeValue;
  }

  try {
    const buildValue = normalizeEnvValue(
      (import.meta.env as Record<string, unknown> | undefined)?.[key]
    );
    if (buildValue !== '') {
      return buildValue;
    }
  } catch {
    // fallback
  }

  try {
    const processValue = normalizeEnvValue(
      typeof process !== 'undefined' ? process.env?.[key] : undefined
    );
    if (processValue !== '') {
      return processValue;
    }
  } catch {
    // fallback
  }

  return '';
}

export function maskSecretValue(value: string) {
  const normalized = normalizeEnvValue(value);
  if (normalized === '') {
    return '';
  }

  if (normalized.length <= 4) {
    return '••••';
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}••••${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}
