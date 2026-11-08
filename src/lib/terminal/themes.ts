export type ThemeName = 'phosphor' | 'amber' | 'midnight' | 'paper'

export const THEMES: Record<ThemeName, { label: string; description: string }> = {
  phosphor: { label: 'phosphor', description: 'classic green CRT glow (default)' },
  amber: { label: 'amber', description: 'warm monochrome, 1983 vibes' },
  midnight: { label: 'midnight', description: 'cool blues for late-night hacking' },
  paper: { label: 'paper', description: 'light mode for the daytime crowd' },
}

export const DEFAULT_THEME: ThemeName = 'phosphor'

export function isTheme(value: string): value is ThemeName {
  return value in THEMES
}
