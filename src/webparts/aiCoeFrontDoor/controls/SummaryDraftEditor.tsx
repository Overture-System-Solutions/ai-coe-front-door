import * as React from 'react';
import type { ISummaryField } from '../summaries/types';

export interface ISummaryDraftEditorProps<TKey extends string> {
  fields: readonly ISummaryField<TKey>[];
  /** Prefix of the field element ids ("summary" for ideas, "disclosure" for team usage). */
  idPrefix: string;
  draft: { [key in TKey]: string } | undefined;
  onChange: (key: TKey, value: string) => void;
}

/** Labelled inputs for each field of an editable summary draft. */
export function SummaryDraftEditor<TKey extends string>({ fields, idPrefix, draft, onChange }: ISummaryDraftEditorProps<TKey>): React.ReactElement {
  return (
    <div className="space-y-5">
      {fields.map((field: ISummaryField<TKey>): React.ReactElement => {
        const id: string = `${idPrefix}-${field.key}`;
        const value: string = draft === undefined ? '' : draft[field.key] || '';
        return (
          <div key={field.key}>
            <label htmlFor={id} className="block text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>
              {field.label}
            </label>
            {field.multiline ? (
              <textarea
                id={id}
                value={value}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => onChange(field.key, event.target.value)}
                rows={2}
                className="overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base"
              />
            ) : (
              <input
                id={id}
                type="text"
                value={value}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange(field.key, event.target.value)}
                className="overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
