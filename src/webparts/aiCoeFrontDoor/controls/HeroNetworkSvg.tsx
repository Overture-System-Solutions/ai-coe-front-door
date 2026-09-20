import * as React from 'react';

export interface IHeroNetworkSvgProps {
  /**
   * True hides the drawing from assistive technology (no image role, no name): the page hero already
   * says everything in words. Absent keeps the shipped landing-page markup, a named image.
   */
  decorative?: boolean;
}

/** Decorative "connected network" illustration behind the landing-page hero. */
export function HeroNetworkSvg({ decorative }: IHeroNetworkSvgProps = {}): React.ReactElement {
  const naming: React.SVGAttributes<SVGSVGElement> = decorative === true ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': 'Abstract connected network' };
  return (
    <svg className="ai-hero-network" viewBox="0 0 760 300" {...naming} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="ai-node-glow" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#74F1EE" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#17BFC8" stopOpacity="0.48" />
          <stop offset="1" stopColor="#0A4069" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id="ai-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7B6BD9" stopOpacity="0.25" />
          <stop offset="0.55" stopColor="#2DCDD2" stopOpacity="0.8" />
          <stop offset="1" stopColor="#B4F8F3" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ai-line)" strokeWidth="1.2">
        <path d="M10 252 C140 28 360 42 742 172" />
        <path d="M18 290 C190 70 430 30 750 240" />
        <path d="M92 310 C230 105 430 105 698 -5" />
        <path d="M190 302 C320 115 550 25 752 82" />
        <path d="M42 164 C230 218 380 142 726 54" />
        <path d="M152 16 C275 98 452 208 742 205" />
        <path d="M284 8 C360 92 500 146 740 287" />
        <path d="M15 210 C160 110 420 210 700 114" />
      </g>
      <g fill="url(#ai-node-glow)" stroke="#42E3E0" strokeOpacity="0.5">
        <circle cx="575" cy="135" r="88" />
        <circle cx="420" cy="58" r="48" />
        <circle cx="460" cy="270" r="62" />
        <circle cx="685" cy="255" r="36" />
      </g>
      <g fill="#39E0DC" stroke="#061B35" strokeWidth="4">
        <circle cx="77" cy="235" r="8" />
        <circle cx="255" cy="205" r="6" />
        <circle cx="357" cy="156" r="6" />
        <circle cx="512" cy="203" r="7" />
        <circle cx="650" cy="170" r="6" />
      </g>
      <g fill="#A98DF3" stroke="#A98DF3">
        <circle cx="218" cy="101" r="6" />
        <circle cx="331" cy="85" r="4" />
        <circle cx="538" cy="44" r="5" />
      </g>
      <g fill="none" stroke="#B8FBF5" strokeOpacity="0.8">
        <circle cx="337" cy="153" r="22" />
        <circle cx="651" cy="170" r="23" />
        <circle cx="575" cy="135" r="112" />
      </g>
    </svg>
  );
}
