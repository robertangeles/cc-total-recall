// templates.js — Platform-specific BRAIN.md injection wrappers.
// Same BRAIN content, different framing per AI to maximise context retention.

const TEMPLATES = {

  claude: (brain) => `<context>
${brain}
</context>

I am continuing work on the above context. Treat all decisions as constraints not suggestions. Do not re-propose anything listed under Rejected.`,

  chatgpt: (brain) => `Memory context from my previous sessions:

${brain}

Treat these decisions as established. Work within these constraints. Do not re-suggest rejected paths.`,

  gemini: (brain) => `Before we start, here is my decision history from previous AI sessions:

${brain}

Continue from this context. Treat decisions as settled.`,

  deepseek: (brain) => `System context:

${brain}

Work within these decisions. Do not re-open rejected paths unless I explicitly ask.`,

  default: (brain) => `Context from previous sessions:

${brain}

Treat these decisions as constraints.`

};

export function getTemplate(platform, brainContent) {
  const fn = TEMPLATES[platform] || TEMPLATES.default;
  return fn(brainContent);
}
