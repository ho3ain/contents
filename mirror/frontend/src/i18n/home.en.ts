/**
 * Public homepage (English). Twin of `home.fa.ts` — identical key set,
 * asserted by `__tests__/home-i18n.test.ts`.
 */
export const homeEn: Record<string, string> = {
  // ---- page meta
  'home.meta.title': 'MESH | AI agent marketplace',
  'home.meta.description':
    'Find the right AI agent for the job: describe what you need, browse by category and compare published agents with full descriptions, transparent pricing and buyer ratings.',

  // ---- hero + quick search
  'home.hero.title': 'Find the right AI agent for the job.',
  'home.hero.lead':
    'MESH is a marketplace for AI agents. Describe what you need, browse by category and compare published agents with full descriptions, transparent pricing and buyer ratings.',
  'home.search.label': 'Search agents',
  'home.search.placeholder': 'What do you want to automate?',
  'home.search.submit': 'Search',
  'home.search.emptyHint': 'Type what you are looking for first.',
  'home.search.suggestionsLabel': 'Popular searches',
  'home.search.chip.sales': 'Sales',
  'home.search.chip.data': 'Data analysis',
  'home.search.chip.support': 'Customer support',
  'home.search.chip.research': 'Research',
  'home.path.label': 'How discovery works on MESH: from a need to a category, then to an agent',
  'home.path.need': 'Need',
  'home.path.needHint': 'The job you want done',
  'home.path.category': 'Category',
  'home.path.categoryHint': 'The matching area of work',
  'home.path.agent': 'Agent',
  'home.path.agentHint': 'A product published by a creator',

  // ---- entry paths
  'home.entry.label': 'Ways in',
  'home.entry.buyer.kicker': 'For buyers',
  'home.entry.buyer.title': 'Find an agent and use it right away',
  'home.entry.buyer.text': 'Search, compare prices and ratings, pay through the bank gateway and reach your purchases from your library.',
  'home.entry.buyer.cta': 'Browse agents',
  'home.entry.buyer.ctaMember': 'My library',
  'home.entry.creator.kicker': 'For creators',
  'home.entry.creator.title': 'Publish your agent and earn from every sale',
  'home.entry.creator.text': 'Publish and manage your product. Before a buyer pays, its page should state its price, delivery method, execution location and support owner.',
  'home.entry.creator.cta': 'Start as a creator',
  'home.entry.creator.learn': 'About the creator program',

  // ---- shared states
  'home.retry': 'Try again',

  // ---- categories
  'home.categories.title': 'Browse by area of work',
  'home.categories.sub': 'Categories that currently have published agents.',
  'home.categories.count': '{count} agents',
  'home.categories.viewAll': 'All categories',
  'home.categories.empty': 'No category has a published agent yet.',
  'home.categories.error': 'Categories could not be loaded.',
  'home.categories.loading': 'Loading categories',

  // ---- featured agents
  'home.featured.title': 'Recommended agents',
  'home.featured.sub': 'From the published catalog, ranked by buyer ratings, adoption and recency.',
  'home.featured.filtersLabel': 'Filter recommended agents',
  'home.featured.filter.all': 'All',
  'home.featured.filter.free': 'Free',
  'home.featured.viewAll': 'View all agents',
  'home.featured.viewAllFree': 'View all free agents',
  'home.featured.empty': 'No agent has been published yet.',
  'home.featured.emptyFree': 'No free agent is published right now.',
  'home.featured.error': 'Agents could not be loaded.',
  'home.featured.loading': 'Loading agents',
  'home.featured.few': '{count} agents currently match this filter.',

  // ---- from need to outcome
  'home.steps.title': 'From need to outcome',
  'home.steps.sub': 'Buying on MESH takes these four steps.',
  'home.steps.1.title': 'Search',
  'home.steps.1.text': 'Describe what you need or start from a category.',
  'home.steps.2.title': 'Review',
  'home.steps.2.text': 'Read each agent’s description, how it works, the final price and buyer ratings.',
  'home.steps.3.title': 'Get it',
  'home.steps.3.text': 'Activate free agents directly; paid agents are paid through the bank gateway.',
  'home.steps.4.title': 'Use it',
  'home.steps.4.text':
    'Setup guidance and access state live in your library; the order also shows the state of any refund request when one is available.',

  // ---- creator ecosystem
  'home.creators.title': 'The creators behind the agents',
  'home.creators.sub':
    'Every agent is published by a creator whose public profile, other products and verification status are visible to everyone.',
  'home.creators.listLabel': 'Creators of the recommended agents',
  'home.creators.viewProfile': 'View profile',
  'home.creators.point.share': 'Each product’s commercial details appear on its own page before purchase',
  'home.creators.point.review': 'Listing-review status is separate from a quality, security or availability guarantee',
  'home.creators.point.payout': 'Buyers can open a support request from their product workspace',
  'home.creators.cta': 'Start publishing',
  'home.creators.learn': 'Creator program',

  // ---- trust & transparency
  'home.trust.title': 'What you see before you buy',
  'home.trust.sub': 'Only what you can verify on the product itself.',
  'home.trust.1.title': 'Full description and price',
  'home.trust.1.text': 'Every agent shows its description, how it works and the final price before purchase.',
  'home.trust.2.title': 'Listing-review status',
  'home.trust.2.text': 'A listing is reviewed before publication. This status is not a security, quality, result or availability certification.',
  'home.trust.3.title': 'Ratings from buyers only',
  'home.trust.3.text': 'Only people who have access to an agent can rate and review it.',
  'home.trust.4.title': 'Support and document status',
  'home.trust.4.text': 'Support contact and the publication status of public documents are available. Opening a support or refund request does not by itself guarantee an outcome or approval.',
  'home.trust.link.contact': 'Contact support',
  'home.trust.link.terms': 'Terms of use',
  'home.trust.link.privacy': 'Privacy policy',
  'home.trust.link.refund': 'Refund policy',
  'home.trust.link.docs': 'Documentation centre',

  // ---- FAQ
  'home.faq.title': 'Common questions',
  'home.faq.sub': 'Short answers; the documentation centre is the full reference for each topic.',
  'home.faq.1.q': 'What exactly does MESH sell?',
  'home.faq.1.a': 'MESH is a marketplace: creators list and sell their own AI products here and you buy them. MESH does not build products itself.',
  'home.faq.2.q': 'Does MESH host or run the products?',
  'home.faq.2.a': 'No. MESH does not host, run or deliver any product. Hosting and execution are the responsibility of the creator, the buyer or a third party, and are declared on each product page.',
  'home.faq.3.q': 'What exactly do I get after buying?',
  'home.faq.3.a': 'Whatever the creator declared in the product\u2019s delivery section. Your access is pinned to the version you bought and stays in your library.',
  'home.faq.4.q': 'Who verifies the product specification?',
  'home.faq.4.a': 'The specification is the creator\u2019s declaration. The MESH review checks the listing for completeness and compliance with platform rules; it is not a performance, security or availability certification.',
  'home.faq.5.q': 'What if the product is not what was described?',
  'home.faq.5.a': 'The refund policy defines the conditions, the time window and the exceptions. You open the request from your orders.',
  'home.faq.6.q': 'How do I become a creator myself?',
  'home.faq.6.a': 'Build with whatever tool you like, then apply to become a creator. Once your profile is approved you can complete a product listing and submit it for review.',
  'home.faq.more': 'See all documentation',

  // ---- final CTA
  'home.cta.title': 'Find your next agent today.',
  'home.cta.text': 'Browsing needs no account; create a free account to buy, save favorites and publish agents.',
  'home.cta.textMember': 'Your purchases are in your library; newly published agents appear in the agent listing.',
  'home.cta.register': 'Create a free account',
  'home.cta.browse': 'Browse agents',
  'home.cta.library': 'My library',
};
