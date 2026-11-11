// Everything a non-developer is likely to edit lives in this file.

export const CONFIG = {
  // Where the clearance form posts { email, agreed: true }. The service should email the
  // confirmation link. While this is null the form runs as a front-end prototype and the
  // "Get cleared" button stands in for that link.
  clearanceEndpoint: null,

  // Optional destinations. Leave null to keep the built-in placeholder behaviour.
  termsUrl: null,   // full Confidentiality Terms page (otherwise the dialog opens)
  callUrl: null,    // "Book a quick call" scheduling link
  ndaUrl: null,     // "Send me the NDA" link
  demoUrl: null,    // "Book a live demo" link shown once cleared

  // Personal addresses get a personal briefing instead of the emailed link.
  personalDomains: [
    'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
    'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net',
  ],
};

// The step-by-step briefing. One entry per file card, in order. Add, remove or reorder freely:
// the layout, numbering, scroll length and counters all follow this list.
//
//   teaser   What a visitor sees before clearance. {n} becomes a redaction bar n characters wide.
//   title    Step headline, shown once cleared.
//   body     One or two sentences on what the step does and why it matters.
//   points   Optional short bullets.
//   media    Optional { type: 'image' | 'video', src, alt, poster }.
//
// Don't put anything truly confidential here while this is a static site: this file is public
// to anyone who opens the browser's developer tools. See README.md, "Before real content goes in".
export const FILES = [
  {
    teaser: 'The {5} that {8} your {6}.',
    title: '[Step 01 title]',
    body: '[What this step does and why it matters, in one or two sentences.]',
    points: ['[Detail]', '[Detail]', '[Detail]'],
    media: null,
  },
  {
    teaser: 'From {5} to {6} in {3} {7}.',
    title: '[Step 02 title]',
    body: '[What this step does and why it matters, in one or two sentences.]',
    points: ['[Detail]', '[Detail]', '[Detail]'],
    media: null,
  },
  {
    teaser: 'Your {6} now {7} the {5}.',
    title: '[Step 03 title]',
    body: '[What this step does and why it matters, in one or two sentences.]',
    points: ['[Detail]', '[Detail]', '[Detail]'],
    media: null,
  },
  {
    teaser: 'Every {4} gets its own {9}.',
    title: '[Step 04 title]',
    body: '[What this step does and why it matters, in one or two sentences.]',
    points: ['[Detail]', '[Detail]', '[Detail]'],
    media: null,
  },
  {
    teaser: 'And the {7} {6} itself.',
    title: '[Step 05 title]',
    body: '[What this step does and why it matters, in one or two sentences.]',
    points: ['[Detail]', '[Detail]', '[Detail]'],
    media: null,
  },
];
