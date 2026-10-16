import { InjectionToken } from '@angular/core';
export interface PublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}
export const PUBLIC_CONFIG = new InjectionToken<PublicConfig>('PUBLIC_CONFIG');
export async function loadPublicConfig(): Promise<PublicConfig> {
  const response = await fetch('/app-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar la configuración de Hamacar.');
  const config = (await response.json()) as PublicConfig;
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl) ||
    !config.supabasePublishableKey?.startsWith('sb_publishable_')
  )
    throw new Error('La configuración pública de Supabase es inválida.');
  return config;
}
