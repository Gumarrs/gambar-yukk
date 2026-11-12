export interface AvatarDef {
  key: string
  emoji: string
  bg: string
}

export const AVATARS: AvatarDef[] = [
  { key: 'avatar-01', emoji: '🐱', bg: '#FFC93C' },
  { key: 'avatar-02', emoji: '🐶', bg: '#FF6B6B' },
  { key: 'avatar-03', emoji: '🦊', bg: '#FFB38A' },
  { key: 'avatar-04', emoji: '🐼', bg: '#6BCB77' },
  { key: 'avatar-05', emoji: '🐸', bg: '#4D96FF' },
  { key: 'avatar-06', emoji: '🦄', bg: '#9B5DE5' },
  { key: 'avatar-07', emoji: '🐙', bg: '#FF8FB1' },
  { key: 'avatar-08', emoji: '🐧', bg: '#8ED1FC' }
]

export const DEFAULT_AVATAR = AVATARS[0].key

/** Unknown keys from the backend still get a stable avatar. */
export function avatarFor(key?: string | null): AvatarDef {
  const found = AVATARS.find((a) => a.key === key)
  if (found) return found
  let h = 0
  for (const ch of key ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATARS[h % AVATARS.length]
}
