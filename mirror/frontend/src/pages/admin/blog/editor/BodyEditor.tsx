import { useEffect, useState, type Ref, type RefObject } from 'react';
import type { BlogBlock } from '../../../../api/blog';
import { SegmentedControl } from '../../../../components/ui/SegmentedControl';
import { t } from '../../../../i18n';
import { MarkdownEditor } from '../editorPanels';
import { ContentEditor, type ContentEditorHandle } from './ContentEditor';

/**
 * Body field of the article editor. Two modes over the SAME `bodyMarkdown`
 * value: the visual Content Studio (default) and the original Markdown
 * textarea (kept as the validated fallback/escape hatch during the staged
 * roll-out — switching modes never converts anything, it only changes the
 * view). The choice is remembered per browser.
 */

export type BodyMode = 'visual' | 'markdown';
const STORAGE_KEY = 'mesh-blog-body-mode';

function readBodyMode(): BodyMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'markdown' ? 'markdown' : 'visual';
  } catch {
    return 'visual';
  }
}

export function BodyEditor({
  value,
  initialBlocks,
  onChange,
  onUploadImage,
  uploadsEnabled,
  textareaRef,
  disabled,
  language,
  handle,
}: {
  value: string;
  initialBlocks?: BlogBlock[] | null;
  onChange: (markdown: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; alt: string } | null>;
  uploadsEnabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  language: 'fa' | 'en';
  handle?: Ref<ContentEditorHandle>;
}) {
  const [mode, setMode] = useState<BodyMode>(readBodyMode);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* private mode */
    }
  }, [mode]);

  return (
    <div className="cs-body" data-testid="blog-body-editor" data-mode={mode}>
      <div className="cs-body__head">
        <span className="field__label">{t('blog.editor.body')}</span>
        <SegmentedControl<BodyMode>
          label={t('blog.cs.mode')}
          value={mode}
          onChange={setMode}
          options={[
            { key: 'visual', label: t('blog.cs.mode.visual') },
            { key: 'markdown', label: t('blog.cs.mode.markdown') },
          ]}
          data-testid="blog-body-mode"
        />
      </div>
      {mode === 'visual' ? (
        <ContentEditor
          value={value}
          initialBlocks={initialBlocks}
          onChange={onChange}
          onUploadImage={onUploadImage}
          uploadsEnabled={uploadsEnabled}
          disabled={disabled}
          language={language}
          handle={handle}
        />
      ) : (
        <MarkdownEditor
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
          uploadsEnabled={uploadsEnabled}
          textareaRef={textareaRef}
          disabled={disabled}
        />
      )}
    </div>
  );
}
