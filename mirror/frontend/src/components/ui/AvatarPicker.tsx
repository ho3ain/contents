/**
 * AvatarPicker — curated Multiavatar people + background color picker.
 *
 * Features:
 *  - 30 human Multiavatar faces in warm, expressive palettes
 *  - 10 background color options
 *  - Live preview
 *  - Keyboard navigation
 *  - Focus visible
 *  - RTL-safe
 *  - Mobile-friendly
 */

import { useState, useCallback, useMemo } from 'react';
import {
  AVATAR_OPTIONS,
  BACKGROUND_OPTIONS,
  avatarDataUri,
  findAvatar,
  findBgColor,
  type AvatarOption,
  type BackgroundOption,
} from '../../lib/avatar';
import { AppIcon } from './AppIcon';
import { t } from '../../i18n';

export interface AvatarPickerValue {
  avatarId: string;
  avatarBg: string;
}

export interface AvatarPickerProps {
  /** Current value. */
  value: AvatarPickerValue;
  /** Called when selection changes (not yet saved). */
  onChange: (value: AvatarPickerValue) => void;
  /** Called when user confirms selection. */
  onSave?: () => void;
  /** Whether save is in progress. */
  saving?: boolean;
}

/** Pre-cache all avatar data URIs at module level for instant rendering. */
const AVATAR_IMAGES: Record<string, string> = {};
for (const opt of AVATAR_OPTIONS) {
  AVATAR_IMAGES[opt.id] = avatarDataUri(opt, 80);
}

export function AvatarPicker({ value, onChange, onSave, saving }: AvatarPickerProps) {
  const [tab, setTab] = useState<'avatar' | 'background'>('avatar');
  const currentAvatar = useMemo(
    () => findAvatar(value.avatarId) ?? AVATAR_OPTIONS[0],
    [value.avatarId],
  );
  const currentBg = findBgColor(value.avatarBg);
  const previewSrc = AVATAR_IMAGES[currentAvatar.id] ?? null;

  const selectAvatar = useCallback(
    (opt: AvatarOption) => {
      onChange({ ...value, avatarId: opt.id });
    },
    [value, onChange],
  );

  const selectBg = useCallback(
    (opt: BackgroundOption) => {
      onChange({ ...value, avatarBg: opt.id });
    },
    [value, onChange],
  );

  return (
    <div className="avatar-picker">
      {/* Preview */}
      <div className="avatar-picker__preview">
        <div
          className="avatar-picker__preview-circle"
          style={{ backgroundColor: currentBg }}
        >
          {previewSrc ? (
            <img src={previewSrc} alt={currentAvatar?.label ?? ''} style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '2rem', color: 'var(--text-3)' }}>?</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="avatar-picker__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'avatar'}
          className={`btn btn--sm ${tab === 'avatar' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => setTab('avatar')}
        >
          {t('avatarPicker.tab.avatar')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'background'}
          className={`btn btn--sm ${tab === 'background' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => setTab('background')}
        >
          {t('avatarPicker.tab.background')}
        </button>
      </div>

      {/* Avatar Grid */}
      {tab === 'avatar' && (
        <div className="avatar-picker__grid" role="radiogroup" aria-label={t('avatarPicker.pickAvatar')}>
          {AVATAR_OPTIONS.map((opt) => {
            const selected = value.avatarId === opt.id;
            const src = AVATAR_IMAGES[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={opt.label}
                className={`avatar-picker__item${selected ? ' avatar-picker__item--selected' : ''}`}
                onClick={() => selectAvatar(opt)}
                style={{ backgroundColor: findBgColor(value.avatarBg) }}
              >
                <img src={src} alt="" aria-hidden="true" style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
                {selected && (
                  <span className="avatar-picker__check" aria-hidden="true">
                    <AppIcon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Background Grid */}
      {tab === 'background' && (
        <div className="avatar-picker__grid avatar-picker__grid--colors" role="radiogroup" aria-label={t('avatarPicker.pickBackground')}>
          {BACKGROUND_OPTIONS.map((opt) => {
            const selected = value.avatarBg === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={opt.label}
                className={`avatar-picker__color${selected ? ' avatar-picker__color--selected' : ''}`}
                style={{ backgroundColor: opt.color }}
                onClick={() => selectBg(opt)}
              >
                {selected && (
                  <span className="avatar-picker__check" aria-hidden="true">
                    <AppIcon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Save */}
      {onSave && (
        <div className="avatar-picker__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? '…' : t('avatarPicker.save')}
          </button>
        </div>
      )}
    </div>
  );
}