// Recovered compiled JavaScript from S181; not original TypeScript.
// Shared lexical scope: assembled in order by scripts/build.mjs; do not import in isolation.
// Descriptive filename assigned during recovery; original symbols preserved.
var re = c(397),
  oe = "overture-ai-coe-front-door-styles";
!(function () {
  if ("undefined" != typeof document && !document.getElementById(oe)) {
    var e = document.createElement("style");
    ((e.id = oe), (e.textContent = re), document.head.appendChild(e));
  }
})();
var se = "\n  :root {\n    --color-primary: "
    .concat("#087F83", ";\n    --color-primary-dark: ")
    .concat("#055D66", ";\n    --color-primary-soft: ")
    .concat("#E8F7F6", ";\n    --color-ink: ")
    .concat("#10243E", ";\n    --color-ink-muted: ")
    .concat("#536276", ";\n    --color-bg: ")
    .concat("#F5F8FB", ";\n    --color-surface: ")
    .concat("#FFFFFF", ";\n    --color-line: ")
    .concat("#D6E0E8", ";\n    --color-info-bg: ")
    .concat("#EAF6F7", ";\n    --color-info-border: ")
    .concat("#B9DDE0", ";\n    --color-info-text: ")
    .concat("#075D67", ";\n    --color-focus: ")
    .concat("#0B66D4", ";\n    --font-sans: ")
    .concat(
      "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
      ';\n  }\n\n  .overture-app { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-ink); min-height: 100%; }\n  .overture-app * { transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }\n  @media (prefers-reduced-motion: reduce) {\n    .overture-app * { transition: none !important; }\n  }\n\n  .overture-app button, .overture-app input, .overture-app textarea, .overture-app a {\n    outline: none;\n    font-family: var(--font-sans);\n  }\n\n  .overture-btn-primary { background-color: var(--color-primary); color: #FFFFFF; border: 2px solid var(--color-primary); }\n  .overture-btn-primary:hover { background-color: var(--color-primary-dark); border-color: var(--color-primary-dark); }\n  .overture-btn-primary:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n\n  .overture-btn-secondary { background-color: var(--color-surface); color: var(--color-ink); border: 2px solid var(--color-line); }\n  .overture-btn-secondary:hover { border-color: var(--color-primary); color: var(--color-primary); }\n  .overture-btn-secondary:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n\n  .overture-btn-ghost { background-color: transparent; color: var(--color-ink-muted); border: 2px solid transparent; }\n  .overture-btn-ghost:hover { color: var(--color-primary); }\n  .overture-btn-ghost:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n\n  .overture-choice { background-color: var(--color-surface); border: 2px solid var(--color-line); color: var(--color-ink); }\n  .overture-choice:hover { border-color: var(--color-primary); }\n  .overture-choice:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n  .overture-choice[aria-pressed="true"] { background-color: var(--color-primary-soft); border-color: var(--color-primary); }\n\n  .overture-input { background-color: var(--color-surface); border: 2px solid var(--color-line); color: var(--color-ink); }\n  .overture-input:focus { border-color: var(--color-primary); outline: 3px solid var(--color-focus); outline-offset: 2px; }\n  .overture-input::placeholder { color: var(--color-ink-muted); }\n\n  .overture-card { background-color: var(--color-surface); border: 2px solid var(--color-line); }\n\n  .overture-home-card { background-color: var(--color-surface); border: 1px solid var(--color-line); color: var(--color-ink); }\n  .overture-home-card:hover { border-color: var(--color-primary); transform: translateY(-1px); }\n  .overture-home-card:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n\n  .overture-notice { background-color: var(--color-info-bg); border: 1px solid var(--color-info-border); color: var(--color-info-text); }\n\n  .overture-link { color: var(--color-primary); background-color: transparent; border: none; }\n  .overture-link:hover { text-decoration: underline; }\n  .overture-link:focus { outline: 3px solid var(--color-focus); outline-offset: 2px; }\n\n  .overture-progress-segment { background-color: var(--color-line); }\n  .overture-progress-segment.is-filled { background-color: var(--color-primary); }\n\n  .overture-badge { background-color: var(--color-surface); border: 1px solid var(--color-line); color: var(--color-ink-muted); }\n\n  .overture-icon-bubble { background-color: var(--color-primary-soft); color: var(--color-primary); }\n',
    ),
  ce = "AICoEPilotPolicies",
  de =
    "Thanks for letting us know. When patient, employee, or customer information may be involved, this may need an extra look before moving forward. That is okay — you do not need to add any details about the information itself. We will just ask a few more general questions.",
  le = "Overture AI CoE governance controls, version 1.1, August 26, 2026",
  ue =
    "Company information includes Overture, client, partner, and internal work information — even when it is not patient, employee, customer, or otherwise confidential. An ongoing work process also counts as a business workflow. Describe information categories and the intended process; do not enter confidential values, source records, prompts, or response content.",
  fe = {
    idea: {
      id: "idea",
      title: "I have an idea for using AI",
      homeDescription: "Share an idea for using AI to help with your work.",
      icon: P,
      resultIntro: "Thanks for sharing your idea.",
      whatHappensNext:
        "Your idea will enter the AI CoE intake and triage process. You will receive the submission identifier shown after confirmation.",
      workflowVersion: "2.1",
      steps: [
        {
          id: "workToImprove",
          type: "textarea",
          title: "What work would you like to improve?",
          help: "Describe the task or process in your own words.",
          placeholder:
            "Example: Reviewing incoming referral forms for missing information.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "painPoints",
          type: "textarea",
          title:
            "What makes this work slow, difficult, repetitive, or frustrating?",
          placeholder:
            "Example: Each form has to be checked by hand, and it's easy to miss something.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "peopleInvolved",
          type: "textarea",
          title: "Who performs or is affected by the work?",
          help: "Describe roles or teams. Please avoid using individual people's names.",
          placeholder:
            "Example: Intake coordinators complete this, and case managers wait on the result.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "frequency",
          type: "select",
          title: "How often does it happen?",
          required: !0,
          options: [
            { value: "daily", label: "Every day" },
            { value: "weekly", label: "A few times a week" },
            { value: "monthly", label: "A few times a month" },
            { value: "rarely", label: "Rarely" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "timeSpent",
          type: "select",
          title: "About how much time does it take today?",
          required: !0,
          options: [
            { value: "minutes", label: "A few minutes" },
            { value: "underHour", label: "Less than an hour" },
            { value: "hours", label: "A few hours" },
            { value: "mostOfDay", label: "Most of a day" },
            { value: "varies", label: "It varies a lot" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "systemsInvolved",
          type: "textarea",
          title: "What systems or tools are involved?",
          help: "This is optional. Name any systems, software, or tools you know of.",
          placeholder: "Example: A scheduling system and a shared spreadsheet.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "informationUsed",
          type: "textarea",
          title: "What information is used to do this work?",
          help: "Describe it in general terms only, like 'contact details' or 'appointment status.' Please don't include the actual information itself.",
          placeholder: "Example: Contact details and appointment status.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "informationCategories",
          type: "multiselect",
          title: "What kind of information might be involved?",
          help: "Pick all that apply.",
          required: !0,
          options: [
            { value: "public", label: "Public information" },
            { value: "internal", label: "Internal business information" },
            { value: "employee", label: "Employee information" },
            { value: "customer", label: "Customer information" },
            { value: "patient", label: "Patient information" },
            {
              value: "otherConfidential",
              label: "Other confidential information",
            },
            { value: "unsure", label: "I am not sure", exclusive: !0 },
          ],
        },
        {
          id: "informationSensitiveNotice",
          type: "notice",
          title: "Thanks for letting us know",
          body: de,
          showIf: function (e) {
            return (
              Array.isArray(e.informationCategories) &&
              e.informationCategories.some(function (e) {
                return [
                  "employee",
                  "customer",
                  "patient",
                  "otherConfidential",
                  "unsure",
                ].includes(e);
              })
            );
          },
        },
        {
          id: "aiAlreadyUsed",
          type: "select",
          title: "Is anyone already using AI for this work?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "aiToolName",
          type: "text",
          title: "What tool or tools are being used?",
          placeholder: "Tool name",
          required: !0,
          showIf: function (e) {
            return "yes" === e.aiAlreadyUsed;
          },
        },
        {
          id: "desiredOutcome",
          type: "textarea",
          title: "What would a better result look like?",
          placeholder:
            "Example: Forms get checked faster, with fewer mistakes.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "successMeasure",
          type: "textarea",
          title: "How would the team know the idea worked?",
          help: "This is optional. Skip it if you are not sure yet.",
          placeholder: "Example: Fewer forms sent back for corrections.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "hasDeadlineSponsor",
          type: "select",
          title:
            "Is there a deadline, sponsor, or current project connected to it?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "deadlineSponsorDetail",
          type: "textarea",
          title: "Tell us more about the deadline, sponsor, or project.",
          placeholder: "Share what you know.",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "yes" === e.hasDeadlineSponsor;
          },
        },
        {
          id: "anythingElse",
          type: "textarea",
          title: "Is there anything else the CoE should understand?",
          help: "This is optional.",
          placeholder: "Share anything else that feels important.",
          required: !1,
          showSafetyNotice: !0,
        },
      ],
    },
    toolCheck: {
      id: "toolCheck",
      title: "I want to know if an AI tool or task is okay",
      homeDescription: "Ask about a tool or task before you use it.",
      icon: T,
      workflowVersion: "2.1",
      steps: [
        {
          id: "helpWith",
          type: "textarea",
          title: "What would you like AI to help with?",
          help: "Describe the task in your own words.",
          placeholder:
            "Example: Drafting first responses to routine client questions.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "toolKnown",
          type: "select",
          title: "Do you know which AI product or tool this is?",
          required: !0,
          options: [
            { value: "yes", label: "Yes, I know the tool" },
            { value: "no", label: "No, not yet" },
          ],
        },
        {
          id: "toolName",
          type: "text",
          title: "What is the name of the tool?",
          placeholder: "Tool name",
          required: !0,
          showIf: function (e) {
            return "yes" === e.toolKnown;
          },
        },
        {
          id: "toolApprovalStatus",
          type: "select",
          title:
            "As far as you know, is this tool already approved, not approved, or unknown to you?",
          help: "This is based on what you know today. There is no wrong answer.",
          required: !0,
          options: [
            { value: "approved", label: "I believe it's already approved" },
            { value: "notApproved", label: "I don't think it's approved yet" },
            { value: "unknown", label: "I don't know" },
          ],
        },
        {
          id: "informationType",
          type: "textarea",
          title: "What type of information would be entered?",
          help: "Describe it in general terms only, like 'meeting notes' or 'project timelines.' Please don't include the actual information itself.",
          placeholder: "Example: Project timelines and general status notes.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "companyDataOrWorkflow",
          type: "select",
          title:
            "Would this use, upload, connect to, or describe company information — or become part of an ongoing work process?",
          help: ue,
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "I am not sure" },
          ],
        },
        {
          id: "sensitiveCategories",
          type: "multiselect",
          title:
            "Would any of these be involved: patient, employee, customer, confidential, or regulated information?",
          help: "Pick all that apply.",
          required: !0,
          options: [
            { value: "patient", label: "Patient information" },
            { value: "employee", label: "Employee information" },
            { value: "customer", label: "Customer information" },
            {
              value: "otherConfidential",
              label: "Other confidential information",
            },
            {
              value: "regulated",
              label: "Regulated information, like financial or legal records",
            },
            { value: "none", label: "None of these", exclusive: !0 },
            { value: "unsure", label: "I am not sure", exclusive: !0 },
          ],
        },
        {
          id: "sensitiveNotice",
          type: "notice",
          title: "Thanks for letting us know",
          body: de,
          showIf: function (e) {
            return (
              Array.isArray(e.sensitiveCategories) &&
              e.sensitiveCategories.some(function (e) {
                return [
                  "patient",
                  "employee",
                  "customer",
                  "otherConfidential",
                  "regulated",
                  "unsure",
                ].includes(e);
              })
            );
          },
        },
        {
          id: "filesUploaded",
          type: "select",
          title: "Would you upload any files?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "fileTypeDetail",
          type: "text",
          title: "What kind of files would you upload?",
          help: "This is optional. Describe the file type, not its contents.",
          placeholder: "Example: spreadsheets, PDFs, or slide decks",
          required: !1,
          showIf: function (e) {
            return "yes" === e.filesUploaded;
          },
        },
        {
          id: "outputSharedExternally",
          type: "select",
          title: "Would the output be shared outside Overture?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "aiDecisionImportance",
          type: "select",
          title: "Would AI recommend or make an important decision?",
          help: "Think about decisions that affect a person's care, job, money, or rights.",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "aiTakesAction",
          type: "select",
          title:
            "Would AI take an action in another system, like sending something or updating a record?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "actionSystemDetail",
          type: "text",
          title: "What system or systems would it act in?",
          placeholder: "Example: the scheduling system",
          required: !1,
          showIf: function (e) {
            return "yes" === e.aiTakesAction;
          },
        },
        {
          id: "humanReview",
          type: "select",
          title: "Would a person review the output before it's used?",
          required: !0,
          options: [
            { value: "always", label: "Yes, every time" },
            { value: "sometimes", label: "Sometimes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "usagePattern",
          type: "select",
          title:
            "Is this something you'd try once, use occasionally, or use as part of an ongoing process?",
          required: !0,
          options: [
            { value: "experimental", label: "Just experimenting" },
            { value: "occasional", label: "Occasional use" },
            { value: "ongoing", label: "Part of an ongoing process" },
            { value: "unsure", label: "Not sure" },
          ],
        },
      ],
    },
    teamUsage: {
      id: "teamUsage",
      title: "My team is already using an AI tool",
      homeDescription: "Tell us about an AI tool your team already uses.",
      icon: U,
      workflowVersion: "2.1",
      steps: [
        {
          id: "toolName",
          type: "text",
          title: "What AI tool or product is your team using?",
          required: !0,
          placeholder: "Tool name",
        },
        {
          id: "usageScope",
          type: "select",
          title: "Is it used by one person, a small team, or a larger group?",
          required: !0,
          options: [
            { value: "onePerson", label: "Just one person" },
            { value: "smallTeam", label: "A small team" },
            { value: "largerGroup", label: "A larger group or department" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "departmentOrWork",
          type: "text",
          title: "What department or type of work is this for?",
          placeholder: "Example: Client billing, or care coordination",
          required: !0,
        },
        {
          id: "toolPurpose",
          type: "textarea",
          title: "What does the tool help accomplish?",
          placeholder:
            "Example: Drafting first responses to routine questions.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "frequency",
          type: "select",
          title: "How often is it used?",
          required: !0,
          options: [
            { value: "daily", label: "Every day" },
            { value: "weekly", label: "A few times a week" },
            { value: "monthly", label: "A few times a month" },
            { value: "rarely", label: "Rarely" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "sourceType",
          type: "select",
          title:
            "Is it free to use, personally purchased, provided by the department, or provided by the company?",
          help: "There's no wrong answer — this just helps us understand how it's being accessed today.",
          required: !0,
          options: [
            { value: "free", label: "Free to use" },
            { value: "personal", label: "Personally purchased" },
            { value: "department", label: "Provided by the department" },
            { value: "company", label: "Provided by the company" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "informationEntered",
          type: "textarea",
          title: "What kinds of information are entered into it?",
          help: "Describe it in general terms only, like 'meeting notes' or 'scheduling details.' Please don't include the actual information itself.",
          placeholder: "Example: General project notes and scheduling details.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "companyDataOrWorkflow",
          type: "select",
          title:
            "Does this use, upload, connect to, or describe company information — or operate as part of an ongoing work process?",
          help: ue,
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "I am not sure" },
          ],
        },
        {
          id: "filesUploaded",
          type: "select",
          title: "Are any files uploaded to it?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "fileTypeDetail",
          type: "text",
          title: "What kind of files?",
          help: "This is optional. Describe the file type, not its contents.",
          placeholder: "Example: spreadsheets or slide decks",
          required: !1,
          showIf: function (e) {
            return "yes" === e.filesUploaded;
          },
        },
        {
          id: "sensitiveCategories",
          type: "multiselect",
          title:
            "Might any of these be involved: patient, employee, customer, or confidential information?",
          help: "Pick all that apply. There's no wrong answer — this just helps us know where to focus support.",
          required: !0,
          options: [
            { value: "patient", label: "Patient information" },
            { value: "employee", label: "Employee information" },
            { value: "customer", label: "Customer information" },
            {
              value: "otherConfidential",
              label: "Other confidential information",
            },
            { value: "none", label: "None of these", exclusive: !0 },
            { value: "unsure", label: "I am not sure", exclusive: !0 },
          ],
        },
        {
          id: "sensitiveNotice",
          type: "notice",
          title: "Thanks for letting us know",
          body: "Thanks for sharing that. When information like this may be involved, it's a good idea to pause that part of the process for now, just until the AI CoE can take a look and offer guidance. The rest of what you shared is still really helpful — please continue.",
          showIf: function (e) {
            return (
              Array.isArray(e.sensitiveCategories) &&
              e.sensitiveCategories.some(function (e) {
                return [
                  "patient",
                  "employee",
                  "customer",
                  "otherConfidential",
                  "unsure",
                ].includes(e);
              })
            );
          },
        },
        {
          id: "benefitObserved",
          type: "textarea",
          title: "What benefit have you noticed from using it?",
          placeholder: "Example: It saves time on first drafts.",
          required: !0,
          showSafetyNotice: !0,
        },
        {
          id: "concernsExperienced",
          type: "textarea",
          title:
            "What problems, limitations, or concerns have you experienced, if any?",
          help: "This is optional. It's okay if nothing comes to mind.",
          placeholder:
            "Example: It sometimes gets facts wrong, so I double-check important details.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "humanReview",
          type: "select",
          title: "Is the output reviewed by a person before it's used?",
          required: !0,
          options: [
            { value: "always", label: "Yes, every time" },
            { value: "sometimes", label: "Sometimes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "aiTakesAction",
          type: "select",
          title:
            "Can the tool take actions in another system, like sending something or updating a record?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ],
        },
        {
          id: "actionNotice",
          type: "notice",
          title: "Thanks for letting us know",
          body: "Thanks for sharing that. When a tool can take an action in another system on its own, it's a good idea to pause that part of the process for now, just until the AI CoE can take a look and offer guidance. The rest of what you shared is still really helpful — please continue.",
          showIf: function (e) {
            return "yes" === e.aiTakesAction;
          },
        },
        {
          id: "actionSystemDetail",
          type: "text",
          title: "What system or systems can it act in?",
          placeholder: "Example: the scheduling system",
          required: !1,
          showIf: function (e) {
            return "yes" === e.aiTakesAction;
          },
        },
        {
          id: "followUpPreference",
          type: "select",
          title:
            "Would you like guidance, training, an approved alternative, or no immediate follow-up?",
          help: "Pick whichever fits best.",
          required: !0,
          options: [
            { value: "guidance", label: "Guidance on using it well" },
            { value: "training", label: "Training on this tool" },
            { value: "alternative", label: "An approved alternative tool" },
            {
              value: "none",
              label: "No immediate follow-up — I just wanted to share this",
            },
          ],
        },
      ],
    },
    helpTraining: {
      id: "helpTraining",
      title: "I need help or training",
      homeDescription: "Get help learning about AI, or find training.",
      icon: F,
      resultIntro: "Thanks for reaching out.",
      whatHappensNext:
        "There's no connected list of courses or sessions yet, so this can't point you to a specific one right now. Your request will be recorded in the AI CoE service queue for follow-up.",
      steps: [
        {
          id: "helpCategory",
          type: "select",
          title: "What would you like help with?",
          required: !0,
          options: [
            { value: "new", label: "I am new to AI" },
            {
              value: "specificTask",
              label: "I need help with a specific task",
            },
            {
              value: "chooseTool",
              label: "I need help choosing an approved tool",
            },
            { value: "teamTraining", label: "My team needs training" },
            { value: "prompting", label: "I need help with prompting" },
            {
              value: "checkingOutput",
              label: "I need help checking AI output",
            },
            { value: "aiProject", label: "I need help with an AI project" },
            { value: "other", label: "Something else" },
          ],
        },
        {
          id: "newToAiFocus",
          type: "textarea",
          title: "Is there anything specific you'd like to start with?",
          help: "This is optional.",
          placeholder: "Example: Understanding what AI can and can't do.",
          required: !1,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "new" === e.helpCategory;
          },
        },
        {
          id: "specificTaskDetail",
          type: "textarea",
          title: "What task would you like help with?",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "specificTask" === e.helpCategory;
          },
        },
        {
          id: "chooseToolGoal",
          type: "textarea",
          title: "What would you like to use AI for?",
          help: "This helps the CoE point you toward the right kind of tool.",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "chooseTool" === e.helpCategory;
          },
        },
        {
          id: "teamTrainingSize",
          type: "select",
          title: "About how many people would need training?",
          required: !0,
          options: [
            { value: "aFew", label: "A few people" },
            { value: "wholeTeam", label: "A whole team or department" },
            { value: "unsure", label: "Not sure yet" },
          ],
          showIf: function (e) {
            return "teamTraining" === e.helpCategory;
          },
        },
        {
          id: "teamTrainingTopics",
          type: "textarea",
          title: "What topics would be most useful?",
          help: "This is optional.",
          placeholder:
            "Example: The basics of what AI can do, or how to write good prompts.",
          required: !1,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "teamTraining" === e.helpCategory;
          },
        },
        {
          id: "promptingGoal",
          type: "textarea",
          title: "What are you trying to get AI to do?",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "prompting" === e.helpCategory;
          },
        },
        {
          id: "checkingOutputDetail",
          type: "textarea",
          title:
            "What kind of output are you checking, and what's making it hard to check?",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "checkingOutput" === e.helpCategory;
          },
        },
        {
          id: "aiProjectDetail",
          type: "textarea",
          title: "Tell us about the project.",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "aiProject" === e.helpCategory;
          },
        },
        {
          id: "aiProjectStage",
          type: "select",
          title: "What stage is it at?",
          required: !0,
          options: [
            { value: "starting", label: "Just starting" },
            { value: "inProgress", label: "In progress" },
            { value: "nearEnd", label: "Near the end" },
            { value: "unsure", label: "Not sure" },
          ],
          showIf: function (e) {
            return "aiProject" === e.helpCategory;
          },
        },
        {
          id: "somethingElseDetail",
          type: "textarea",
          title: "Tell us what you need help with.",
          required: !0,
          showSafetyNotice: !0,
          showIf: function (e) {
            return "other" === e.helpCategory;
          },
        },
        {
          id: "name",
          type: "text",
          title: "What is your name?",
          required: !0,
          placeholder: "Your name",
        },
        {
          id: "team",
          type: "text",
          title: "What team are you on?",
          required: !0,
          placeholder: "Your team or department",
        },
        {
          id: "email",
          type: "text",
          title: "What is your work email?",
          help: "This is optional. Add it if you would like a reply.",
          required: !1,
          placeholder: "name@example.com",
        },
      ],
    },
    feedback: {
      id: "feedback",
      title: "I want to give the AI CoE feedback",
      homeDescription: "Share your thoughts to help us do better.",
      icon: H,
      workflowVersion: "2.0",
      steps: [
        {
          id: "serviceInvolved",
          type: "select",
          title: "What did you contact or use the CoE for?",
          required: !0,
          options: [
            { value: "idea", label: "Sharing an idea for using AI" },
            { value: "toolCheck", label: "Checking if a tool or task is okay" },
            {
              value: "teamUsage",
              label: "Letting the CoE know about a tool my team uses",
            },
            { value: "helpTraining", label: "Getting help or training" },
            { value: "general", label: "Something else, or general feedback" },
          ],
        },
        {
          id: "gotClearNextStep",
          type: "select",
          title: "Did you get a clear next step?",
          required: !0,
          options: [
            { value: "clear", label: "Yes, very clear" },
            { value: "somewhat", label: "Somewhat clear" },
            { value: "notClear", label: "No, not clear" },
            { value: "notApplicable", label: "Not applicable" },
          ],
        },
        {
          id: "easeRating",
          type: "select",
          title: "How easy was the process?",
          required: !0,
          options: [
            { value: "veryEasy", label: "Very easy" },
            { value: "easy", label: "Easy" },
            { value: "okay", label: "Okay" },
            { value: "difficult", label: "Difficult" },
            { value: "veryDifficult", label: "Very difficult" },
          ],
        },
        {
          id: "positiveFeedback",
          type: "textarea",
          title: "What helped?",
          help: "This is optional.",
          placeholder: "Example: The questions were easy to follow.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "frictionPoints",
          type: "textarea",
          title: "What was confusing or difficult, if anything?",
          help: "This is optional.",
          placeholder: "Example: I wasn't sure which option to pick at first.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "suggestedImprovement",
          type: "textarea",
          title: "What should the CoE improve?",
          help: "This is optional.",
          placeholder: "Example: More examples of what to type.",
          required: !1,
          showSafetyNotice: !0,
        },
        {
          id: "followUpPermission",
          type: "select",
          title: "May the CoE contact you about this feedback?",
          required: !0,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        },
        {
          id: "contactName",
          type: "text",
          title: "What's your name?",
          placeholder: "Your name",
          required: !0,
          showIf: function (e) {
            return "yes" === e.followUpPermission;
          },
        },
        {
          id: "contactEmail",
          type: "text",
          title: "What's your work email?",
          help: "This is optional.",
          placeholder: "name@example.com",
          required: !1,
          showIf: function (e) {
            return "yes" === e.followUpPermission;
          },
        },
      ],
    },
  },
  pe = ["idea", "toolCheck", "teamUsage", "helpTraining", "feedback"];
