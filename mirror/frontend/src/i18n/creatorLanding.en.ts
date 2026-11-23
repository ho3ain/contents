/**
 * Creator landing page (`/developers`) — English copy.
 *
 * Mirror of `creatorLanding.fa.ts`: identical key set, identical `{…}`
 * placeholders. See that file for the rules the parity test enforces.
 */
export const creatorLandingEn: Record<string, string> = {
  // ---- document meta -------------------------------------------------------
  'creatorLanding.meta.title': 'For creators | MESH',
  'creatorLanding.meta.description':
    'List and publish your AI product on MESH: the seven product types, the review path, the commercial terms and the platform responsibility boundary.',

  // ---- hero ----------------------------------------------------------------
  'creatorLanding.hero.title': 'List your AI product,',
  'creatorLanding.hero.titleEm': 'publish it and reach buyers.',
  'creatorLanding.hero.lead':
    'Build it anywhere, sell it here. MESH is where your product is listed, reviewed and sold; building, hosting and running it stays with you.',
  'creatorLanding.hero.cta.secondary': 'See the publication path',

  // ---- hero card: the real publication path --------------------------------
  'creatorLanding.path.title': 'The actual publication path',
  'creatorLanding.path.step.draft.title': 'Product draft',
  'creatorLanding.path.step.draft.detail': 'You fill in the product wizard step by step; the draft autosaves.',
  'creatorLanding.path.step.readiness.title': 'Readiness checklist',
  'creatorLanding.path.step.readiness.detail': 'The server checks completeness and tells you exactly what is missing.',
  'creatorLanding.path.step.review.title': 'Review and feedback',
  'creatorLanding.path.step.review.detail': 'The review team checks the listing; feedback is specific and trackable.',
  'creatorLanding.path.step.publish.title': 'Version published',
  'creatorLanding.path.step.publish.detail': 'A published version is immutable and buyer access is pinned to it.',
  'creatorLanding.path.note':
    'You can build drafts before your creator profile is approved, but "Submit for review" and "Publish" stay disabled. MESH does not commit to a review time.',

  // ---- proof story ---------------------------------------------------------
  'creatorLanding.proof.title': 'From an idea to',
  'creatorLanding.proof.titleEm': 'a product people use.',
  'creatorLanding.proof.lead': 'Four clear steps that turn a real need into a product that actually gets used.',
  'creatorLanding.proof.step.need.title': 'Find a real need',
  'creatorLanding.proof.step.need.detail': 'Identify a problem that is worth solving.',
  'creatorLanding.proof.step.build.title': 'Build the product',
  'creatorLanding.proof.step.build.detail': 'Build it with any tool you like; MESH has no builder and does not restrict you.',
  'creatorLanding.proof.step.describe.title': 'Describe it honestly',
  'creatorLanding.proof.step.describe.detail': 'Declare the capabilities, prerequisites and delivery method precisely.',
  'creatorLanding.proof.step.improve.title': 'Improve it',
  'creatorLanding.proof.step.improve.detail': 'Use buyer feedback for the next version.',

  // ---- product types -------------------------------------------------------
  'creatorLanding.types.title': 'What can you list?',
  'creatorLanding.types.lead':
    'MESH defines seven product types. You declare the product type, the delivery model and the execution model yourself while building the listing.',
  'creatorLanding.types.more': 'More detail',
  'creatorLanding.types.field.delivery': 'Buyer receives:',
  'creatorLanding.types.field.fit': 'Good for:',
  'creatorLanding.types.field.execution': 'Execution:',
  'creatorLanding.types.field.prereq': 'Prerequisite:',
  'creatorLanding.types.field.coding': 'Coding:',

  'creatorLanding.types.ai_agent.summary':
    'A solution that performs one specific task for the buyer and can carry part of the work on its own.',
  'creatorLanding.types.ai_agent.delivery': 'A ready-to-use agent, access or a defined configuration.',
  'creatorLanding.types.ai_agent.fit': 'Solving one repeated, well-defined problem.',
  'creatorLanding.types.ai_agent.execution': 'On your infrastructure, the buyer\u2019s or a third party\u2019s — whichever you declare.',
  'creatorLanding.types.ai_agent.prereq': 'A clear definition of the task, its input and its output.',
  'creatorLanding.types.ai_agent.coding': 'Not required; it depends on how complex the agent is.',

  'creatorLanding.types.ai_assistant.summary':
    'An interactive assistant that answers, guides and helps users through a defined process.',
  'creatorLanding.types.ai_assistant.delivery': 'A ready assistant with instructions and a defined scope.',
  'creatorLanding.types.ai_assistant.fit': 'Support, training and user guidance.',
  'creatorLanding.types.ai_assistant.execution': 'The conversation surface or channel you choose.',
  'creatorLanding.types.ai_assistant.prereq': 'Reliable content, a tone of voice and answer scenarios.',
  'creatorLanding.types.ai_assistant.coding': 'Usually not; custom integrations may need code.',

  'creatorLanding.types.ai_workflow.summary':
    'A multi-step process that connects tasks and tools so a complete job gets done.',
  'creatorLanding.types.ai_workflow.delivery': 'A ready workflow, its execution steps and a setup guide.',
  'creatorLanding.types.ai_workflow.fit': 'Teams automating an end-to-end process.',
  'creatorLanding.types.ai_workflow.execution': 'In the tools, APIs or infrastructure you name.',
  'creatorLanding.types.ai_workflow.prereq': 'Defined steps, inputs, outputs and connections.',
  'creatorLanding.types.ai_workflow.coding': 'Depends on the integrations; from no-code to technical.',

  'creatorLanding.types.automation.summary': 'A solution that automates repetitive work and removes manual effort.',
  'creatorLanding.types.automation.delivery': 'The automation scenario, its settings and usage instructions.',
  'creatorLanding.types.automation.fit': 'Operations, sales, reporting and repeated tasks.',
  'creatorLanding.types.automation.execution': 'Between the connected services and tools, in the environment you declare.',
  'creatorLanding.types.automation.prereq': 'Access to the tools and a defined trigger and action.',
  'creatorLanding.types.automation.coding': 'Usually not; an API or custom logic may be needed.',

  'creatorLanding.types.template.summary': 'A ready template for a fast start that the buyer can customise.',
  'creatorLanding.types.template.delivery': 'A usable, documented file, structure or template.',
  'creatorLanding.types.template.fit': 'Getting similar projects and processes started quickly.',
  'creatorLanding.types.template.execution': 'In the tool or environment the template was built for.',
  'creatorLanding.types.template.prereq': 'The target tool and an install or usage guide.',
  'creatorLanding.types.template.coding': 'Depends on the template; it can be fully no-code.',

  'creatorLanding.types.api_service.summary':
    'A service technical teams can call over an API from their own products and systems.',
  'creatorLanding.types.api_service.delivery': 'The endpoint, access, documentation and service limits.',
  'creatorLanding.types.api_service.fit': 'Technical teams and products that want a direct integration.',
  'creatorLanding.types.api_service.execution': 'On your infrastructure or an environment agreed with the buyer.',
  'creatorLanding.types.api_service.prereq': 'An access key, documentation and integration know-how.',
  'creatorLanding.types.api_service.coding': 'Yes; connecting and using it normally requires it.',

  'creatorLanding.types.setup_service.summary':
    'A service that installs, configures and sets things up so the buyer can start faster.',
  'creatorLanding.types.setup_service.delivery': 'A completed setup, its configuration and initial training.',
  'creatorLanding.types.setup_service.fit': 'Teams that want the solution but outsource running it.',
  'creatorLanding.types.setup_service.prereq': 'Access, project information and a clear service scope.',
  'creatorLanding.types.setup_service.execution': 'In the buyer\u2019s environment or the agreed infrastructure.',
  'creatorLanding.types.setup_service.coding': 'Project dependent; it may be needed.',

  'creatorLanding.types.disclosure.title': 'What you declare is what the buyer sees.',
  'creatorLanding.types.disclosure.body':
    'The delivery model, the execution model and the hosting responsibility are your declaration. MESH reviews them for completeness and consistency, but does not guarantee the product\u2019s performance, availability or hosting.',

  // ---- readiness -----------------------------------------------------------
  'creatorLanding.readiness.title': 'What do you need to start?',
  'creatorLanding.readiness.lead':
    'Nothing has to be perfect; you just need to know which problem you solve, for whom, and how you deliver it.',
  'creatorLanding.readiness.node.problem.title': 'A real problem',
  'creatorLanding.readiness.node.problem.detail': 'You know which problem you solve and why it matters.',
  'creatorLanding.readiness.node.audience.title': 'A defined audience',
  'creatorLanding.readiness.node.audience.detail': 'You know who the product is built for.',
  'creatorLanding.readiness.node.delivery.title': 'Clear delivery',
  'creatorLanding.readiness.node.delivery.detail': 'You know what the buyer receives and how they use it.',
  'creatorLanding.readiness.not.title': 'You do not need',
  'creatorLanding.readiness.not.1': 'to be a professional developer',
  'creatorLanding.readiness.not.2': 'a highly complex product',
  'creatorLanding.readiness.not.3': 'dedicated infrastructure ready to go',
  'creatorLanding.readiness.not.4': 'a prior sales record',
  'creatorLanding.readiness.not.5': 'a large team',
  'creatorLanding.readiness.yes.title': 'You do need',
  'creatorLanding.readiness.yes.1': 'a real problem you want to solve',
  'creatorLanding.readiness.yes.2': 'a clear description of what you offer',
  'creatorLanding.readiness.yes.3': 'a defined audience',
  'creatorLanding.readiness.yes.4': 'an understandable delivery and usage path',
  'creatorLanding.readiness.yes.5': 'transparent prerequisites and limitations',
  'creatorLanding.readiness.bottom.title': 'Being complete is not the entry condition;',
  'creatorLanding.readiness.bottom.detail': 'being clear about the problem, the audience and the delivery matters more.',

  // ---- commercial terms ----------------------------------------------------
  'creatorLanding.terms.title': 'The commercial terms, before you invest time',
  'creatorLanding.terms.lead':
    'These figures are the current platform policy. The policy is versioned and changes are not applied retroactively. The documentation and the terms of use are the authoritative source.',
  'creatorLanding.terms.days': '{days} days',
  'creatorLanding.terms.share.label': 'Your share of each sale',
  'creatorLanding.terms.share.detail': 'The platform commission is currently {commission}.',
  'creatorLanding.terms.holding.label': 'Earnings holding period',
  'creatorLanding.terms.holding.detail': 'Earnings from a sale become withdrawable after this period.',
  'creatorLanding.terms.payout.label': 'Interval between payouts',
  'creatorLanding.terms.payout.detail': 'Every payout request needs approved identity verification and admin approval.',
  'creatorLanding.terms.refund.label': 'Buyer refund window',
  'creatorLanding.terms.refund.detail': 'The conditions and exceptions are in the refund policy.',
  'creatorLanding.terms.pricing.label': 'Pricing model',
  'creatorLanding.terms.pricing.value': 'Free or one-time payment',
  'creatorLanding.terms.pricing.detail': 'Recurring subscriptions and usage billing are not supported at the moment.',
  'creatorLanding.terms.currency.label': 'Currency',
  'creatorLanding.terms.currency.value': 'Iranian rial',
  'creatorLanding.terms.currency.detail': 'Payment goes through the domestic payment gateway.',
  'creatorLanding.terms.tax.note':
    'No written policy on creator tax obligations has been published yet; the share shown here is before any tax obligation that may apply.',
  'creatorLanding.terms.link.earnings': 'Earnings and payouts documentation',
  'creatorLanding.terms.link.terms': 'Terms of use',
  'creatorLanding.terms.link.refunds': 'Refund policy',

  // ---- platform boundary (P13) ---------------------------------------------
  'creatorLanding.boundary.title': 'The boundary: what MESH does not do',
  'creatorLanding.boundary.lead':
    'MESH is an intermediary. Knowing this boundary before you publish matters for you and for your buyers.',
  'creatorLanding.boundary.hosting.title': 'Does not host',
  'creatorLanding.boundary.hosting.detail':
    'No product is hosted on MESH infrastructure. Hosting responsibility sits with you, the buyer or a third party.',
  'creatorLanding.boundary.execution.title': 'Does not run',
  'creatorLanding.boundary.execution.detail':
    'MESH does not execute your product. It runs in the environment you declared.',
  'creatorLanding.boundary.delivery.title': 'Does not deliver',
  'creatorLanding.boundary.delivery.detail':
    'What the buyer sees after purchase is the information and instructions you declared; the actual delivery happens outside MESH.',
  'creatorLanding.boundary.build.title': 'Is not a builder',
  'creatorLanding.boundary.build.detail':
    'MESH has no product builder. Build with n8n, Dify, custom code or anything else, then list the result here.',
  'creatorLanding.boundary.link': 'This boundary is defined in the terms of use',

  // ---- trust ---------------------------------------------------------------
  'creatorLanding.trust.title': 'A clear path for your product;',
  'creatorLanding.trust.titleEm': 'from preparation to publication',
  'creatorLanding.trust.lead':
    'You know what information publication needs, which stages lie ahead and how your product is presented to buyers.',
  'creatorLanding.trust.status.head': 'A review path you can follow',
  'creatorLanding.trust.status.info.title': 'Product information',
  'creatorLanding.trust.status.info.detail': 'Defined description, capabilities and use case',
  'creatorLanding.trust.status.profile.title': 'Creator profile',
  'creatorLanding.trust.status.profile.detail': 'Completed and approved details',
  'creatorLanding.trust.status.review.title': 'Review and feedback',
  'creatorLanding.trust.status.review.detail': 'Trackable criteria and corrections',
  'creatorLanding.trust.status.publish.title': 'Ready to publish',
  'creatorLanding.trust.status.publish.detail': 'Listed in the marketplace',
  'creatorLanding.trust.principles.title': 'Creator trust is built on',
  'creatorLanding.trust.principles.titleEm': 'transparency',
  'creatorLanding.trust.principles.titleAfter': '— not on polish.',
  'creatorLanding.trust.principles.lead': 'You know how your product is reviewed and displayed, and what comes next at every stage.',
  'creatorLanding.trust.principle.ownership.title': 'Ownership stays with you',
  'creatorLanding.trust.principle.ownership.detail':
    'You keep ownership of the product. By publishing you grant MESH a non-exclusive licence to use the name, descriptions, images and listing information to display, index and promote it on the platform.',
  'creatorLanding.trust.principle.review.title': 'Transparent review',
  'creatorLanding.trust.principle.review.detail':
    'You know from the start what the listing is reviewed against: completeness, consistency between the specification and the description, and compliance with platform rules.',
  'creatorLanding.trust.principle.version.title': 'A published version is immutable',
  'creatorLanding.trust.principle.version.detail':
    'Once published, that version is fixed and buyer access is pinned to it. Changes go out as a new version.',
  'creatorLanding.trust.principle.feedback.title': 'Actionable feedback',
  'creatorLanding.trust.principle.feedback.detail':
    'If something needs fixing you see the reason and get the chance to complete it before publication.',

  // ---- examples ------------------------------------------------------------
  'creatorLanding.examples.title': 'Ideas to build',
  'creatorLanding.examples.lead': 'These show how a real problem turns into a product.',
  'creatorLanding.examples.disclaimer':
    'These are hypothetical examples for inspiration, not real products published on MESH. Browse the marketplace for the real ones.',
  'creatorLanding.examples.browse': 'Browse real marketplace products',
  'creatorLanding.examples.filterLabel': 'Filter examples',
  'creatorLanding.examples.meta.delivery': 'Delivery',
  'creatorLanding.examples.meta.fit': 'Good for',
  'creatorLanding.examples.structure': 'See the product structure',
  'creatorLanding.examples.cat.sales': 'Sales',
  'creatorLanding.examples.cat.data': 'Data analysis',
  'creatorLanding.examples.cat.support': 'Customer support',
  'creatorLanding.examples.cat.research': 'Research',
  'creatorLanding.examples.sales.1.title': 'Sales opportunity recommender',
  'creatorLanding.examples.sales.1.detail': 'Helps a sales team prioritise opportunities.',
  'creatorLanding.examples.sales.2.title': 'Automated customer follow-up',
  'creatorLanding.examples.sales.2.detail': 'Records and follows sales stages on a simple track.',
  'creatorLanding.examples.sales.3.title': 'Daily sales report',
  'creatorLanding.examples.sales.3.detail': 'Collects the data and prepares the report.',
  'creatorLanding.examples.data.1.title': 'Data pattern analyst',
  'creatorLanding.examples.data.1.detail': 'Finds the meaningful patterns in business data.',
  'creatorLanding.examples.data.2.title': 'Decision dashboard',
  'creatorLanding.examples.data.2.detail': 'Connects the data and prepares a management summary.',
  'creatorLanding.examples.data.3.title': 'Data cleanup',
  'creatorLanding.examples.data.3.detail': 'Removes manual work before analysis.',
  'creatorLanding.examples.support.1.title': 'Customer response assistant',
  'creatorLanding.examples.support.1.detail': 'Answers repeated questions and routes the user.',
  'creatorLanding.examples.support.2.title': 'Request triage',
  'creatorLanding.examples.support.2.detail': 'Receives, classifies and routes tickets.',
  'creatorLanding.examples.support.3.title': 'Satisfaction follow-up',
  'creatorLanding.examples.support.3.detail': 'Records feedback and sends automatic reminders.',
  'creatorLanding.examples.research.1.title': 'Market research assistant',
  'creatorLanding.examples.research.1.detail': 'Gathers and summarises relevant information.',
  'creatorLanding.examples.research.2.title': 'Source comparison',
  'creatorLanding.examples.research.2.detail': 'Builds an orderly path for reviewing sources.',
  'creatorLanding.examples.research.3.title': 'Research reporting',
  'creatorLanding.examples.research.3.detail': 'Turns collected data into a first draft output.',

  // ---- journey -------------------------------------------------------------
  'creatorLanding.journey.title': 'From idea to buyer',
  'creatorLanding.journey.lead': 'Seven stages from the first idea to your first real buyer.',
  'creatorLanding.journey.step.discover.title': 'Discover',
  'creatorLanding.journey.step.discover.detail': 'Find a real problem that is worth solving.',
  'creatorLanding.journey.step.build.title': 'Build',
  'creatorLanding.journey.step.build.detail': 'Build the product with the tool of your choice.',
  'creatorLanding.journey.step.describe.title': 'Describe',
  'creatorLanding.journey.step.describe.detail': 'Complete the product information, audience and delivery method.',
  'creatorLanding.journey.step.review.title': 'Review',
  'creatorLanding.journey.step.review.detail': 'Get specific feedback and bring the listing to publication quality.',
  'creatorLanding.journey.step.publish.title': 'Publish',
  'creatorLanding.journey.step.publish.detail': 'An immutable version of the product goes live in the marketplace.',
  'creatorLanding.journey.step.reach.title': 'Reach an audience',
  'creatorLanding.journey.step.reach.detail': 'The product appears in marketplace search, categories and industries.',
  'creatorLanding.journey.step.grow.title': 'Grow',
  'creatorLanding.journey.step.grow.detail': 'Use real sales and feedback for the next version.',

  // ---- studio capabilities -------------------------------------------------
  'creatorLanding.studio.title': 'In the creator studio,',
  'creatorLanding.studio.titleEm': 'what do you get?',
  'creatorLanding.studio.lead': 'These are implemented in the product and available once your profile is approved.',
  'creatorLanding.studio.item.wizard.title': 'Product wizard with autosave',
  'creatorLanding.studio.item.wizard.detail': 'Complete the listing step by step; the draft is always saved.',
  'creatorLanding.studio.item.readiness.title': 'Server-side readiness checklist',
  'creatorLanding.studio.item.readiness.detail': 'Before you submit you know exactly what is missing.',
  'creatorLanding.studio.item.versions.title': 'Version management and release notes',
  'creatorLanding.studio.item.versions.detail': 'Build a new version and write the changes for your buyers.',
  'creatorLanding.studio.item.finance.title': 'Finance and payout dashboard',
  'creatorLanding.studio.item.finance.detail': 'See sales, held earnings and the status of each payout request.',
  'creatorLanding.studio.item.feedback.title': 'Review feedback',
  'creatorLanding.studio.item.feedback.detail': 'Receive and track correction items with their reasons.',

  // ---- documentation links -------------------------------------------------
  'creatorLanding.docs.title': 'Read these before you start',
  'creatorLanding.docs.lead': 'The official creator documentation; each page is the reference for its own topic.',
  'creatorLanding.docs.becoming.title': 'Becoming a creator',
  'creatorLanding.docs.becoming.detail': 'Requirements, the application steps and profile approval status.',
  'creatorLanding.docs.publishing.title': 'Publishing a product',
  'creatorLanding.docs.publishing.detail': 'What a listing needs, the readiness checklist and versions.',
  'creatorLanding.docs.review.title': 'The review process',
  'creatorLanding.docs.review.detail': 'What gets reviewed and how feedback is delivered.',
  'creatorLanding.docs.earnings.title': 'Earnings and payouts',
  'creatorLanding.docs.earnings.detail': 'Commission, holding, withdrawal conditions and identity verification.',
  'creatorLanding.docs.faq.title': 'Creator FAQ',
  'creatorLanding.docs.faq.detail': 'Short answers to the most common questions.',
  'creatorLanding.docs.all': 'All documentation',

  // ---- FAQ -----------------------------------------------------------------
  'creatorLanding.faq.title': 'Know this before you publish',
  'creatorLanding.faq.lead': 'Short answers to the questions people usually ask before signing up.',
  'creatorLanding.faq.q.types': 'What kind of product can I publish?',
  'creatorLanding.faq.a.types':
    'Seven product types are defined: automation, AI workflow, AI agent, AI assistant, template, API service and setup service. The product must solve a defined need and have a clear use case, audience and delivery method.',
  'creatorLanding.faq.q.tools': 'Do I have to build with a specific tool?',
  'creatorLanding.faq.a.tools':
    'No. MESH has no builder. Build with n8n, Dify, Python, Node.js, custom code or anything else; you only declare the build tool when you create the listing.',
  'creatorLanding.faq.q.hosting': 'Does MESH host or run my product?',
  'creatorLanding.faq.a.hosting':
    'No. MESH does not host, run or deliver any product. Hosting and execution responsibility sits with you, the buyer or a third party, and you declare it in the listing.',
  'creatorLanding.faq.q.revenue': 'What is my share of each sale?',
  'creatorLanding.faq.a.revenue':
    'Currently {share} of each sale is yours and {commission} is the platform commission. Earnings become withdrawable after a {holding}-day holding period. These figures are the current policy and changes are not applied retroactively.',
  'creatorLanding.faq.q.payout': 'When can I withdraw?',
  'creatorLanding.faq.a.payout':
    'After the holding period ends and respecting the {cooldown}-day interval between requests. A payout needs approved identity verification and admin approval.',
  'creatorLanding.faq.q.pricing': 'Can I sell my product as a subscription?',
  'creatorLanding.faq.a.pricing':
    'Not at the moment. Pricing is free or one-time payment only, and the currency is the Iranian rial.',
  'creatorLanding.faq.q.refund': 'What happens if a buyer requests a refund?',
  'creatorLanding.faq.a.refund':
    'The refund window is {refund} days; its conditions and exceptions are in the refund policy. An approved refund affects the held earnings of that sale.',
  'creatorLanding.faq.q.timeline': 'How long does review take?',
  'creatorLanding.faq.a.timeline':
    'MESH does not commit to a review time. The review status and feedback are trackable in the creator studio.',
  'creatorLanding.faq.q.ownership': 'What happens to the ownership of my product?',
  'creatorLanding.faq.a.ownership':
    'Ownership stays with you. By publishing you grant MESH a non-exclusive licence to use the listing information to display, index and promote the product on the platform. The details are in the terms of use.',

  // ---- final CTA -----------------------------------------------------------
  'creatorLanding.final.title': 'Build something that',
  'creatorLanding.final.titleEm': 'actually gets used.',
  'creatorLanding.final.lead': 'Every useful product starts from a real problem.',
  'creatorLanding.final.kicker': 'Ready to start?',
  'creatorLanding.final.panel': 'List your product, reach buyers and grow on real feedback.',
  'creatorLanding.final.benefit.share': '{share} share of every sale',
  'creatorLanding.final.benefit.version': 'Immutable published versions',
  'creatorLanding.final.benefit.feedback': 'Trackable review feedback',
};
