import * as React from 'react';
import { Info } from '../../icons';
import type { IReviewContact } from '../../services/toolPolicyEvaluator';

export interface IReviewRequestContactFormProps {
  contact: IReviewContact;
  onChange: (key: keyof IReviewContact, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  error: string | undefined;
}

interface IContactFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function ContactField({ id, label, hint, value, placeholder, onChange }: IContactFieldProps): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>
        {label}
      </label>
      {hint !== undefined && (
        <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {hint}
        </p>
      )}
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange(event.target.value)}
        placeholder={placeholder}
        className="overture-input mt-1.5 w-full rounded-xl px-4 py-3 text-base"
      />
    </div>
  );
}

/** Name, team and optional email collected before a CoE review request is filed. */
export function ReviewRequestContactForm({ contact, onChange, onCancel, onSubmit, error }: IReviewRequestContactFormProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Create a CoE review request</h2>
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          Add your name and team so the AI CoE team knows who to follow up with. Your guidance answers come along automatically.
        </p>
      </div>
      <ContactField id="review-contact-name" label="Your name" value={contact.name} placeholder="Your name" onChange={(value: string): void => onChange('name', value)} />
      <ContactField
        id="review-contact-team"
        label="Your team"
        value={contact.team}
        placeholder="Your team or department"
        onChange={(value: string): void => onChange('team', value)}
      />
      <ContactField
        id="review-contact-email"
        label="Work email"
        hint="This is optional. Add it if you would like a reply."
        value={contact.email}
        placeholder="name@example.com"
        onChange={(value: string): void => onChange('email', value)}
      />
      {error && (
        <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-info-text)' }}>
          <Info className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3 pt-2">
        <button type="button" onClick={onCancel} className="overture-btn-secondary rounded-xl px-4 py-2.5 text-base font-medium">
          Back to result
        </button>
        <button type="button" onClick={onSubmit} className="overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold">
          Create review request
        </button>
      </div>
    </div>
  );
}
