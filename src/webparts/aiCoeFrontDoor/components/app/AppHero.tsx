import * as React from 'react';
import type { AppSectionId, IEntryChoice } from '../../content/appSections';

/**
 * The first screen: one sentence saying what this is for, then the three ways in.
 *
 * The prototype puts a natural-language command above the three choices. That control is deliberately not built
 * here yet, because a command bar that cannot route a sentence anywhere proved is a promise the front door cannot
 * keep; the route list that would back it fails closed to the guided request until a tenant proves a destination.
 * The three choices are the honest form of the same idea and each one leads somewhere that works today.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IAppHeroProps {
  organizationName: string;
  choices: readonly IEntryChoice[];
  onChoose: (section: AppSectionId) => void;
}

export function AppHero({ organizationName, choices, onChoose }: IAppHeroProps): React.ReactElement {
  return (
    <div className="ai-app-hero-wrap">
      <div className="ai-app-hero">
        <p className="ai-app-hero-eyebrow">{`${organizationName} AI Center of Excellence`}</p>
        <p className="ai-app-hero-title">Make the next move.</p>
        <p className="ai-app-hero-text">
          Ask for what you need. A person reads every request, and every answer says what it rests on.
        </p>
      </div>
      <ul className="ai-app-choices">
        {choices.map((choice: IEntryChoice): React.ReactElement => (
          <li key={choice.step} className="ai-app-choice">
            <button type="button" className="ai-app-choice-button" onClick={(): void => onChoose(choice.section)}>
              <span className="ai-app-choice-step">{choice.step}</span>
              <span className="ai-app-choice-title">{choice.title}</span>
              <span className="ai-app-choice-text">{choice.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
