/**
 * The fixed security review checklist admins walk through before a listing
 * is reviewed/published (PLAYBOOK 7.11). `item_key` values are stored in
 * security_review_items.item_key.
 */
export interface SecurityChecklistItem {
  key: string;
  label: string;
}

export const SECURITY_CHECKLIST: SecurityChecklistItem[] = [
  { key: 'identity', label: 'Creator identity is confirmed' },
  { key: 'listing_accuracy', label: 'Listing is accurate and not misleading' },
  { key: 'demo', label: 'Demo works and proves the claims' },
  { key: 'capabilities', label: 'Declared capabilities are real' },
  { key: 'limitations', label: 'Limitations are honest and complete' },
  { key: 'permissions', label: 'Permissions are transparent and justified' },
  { key: 'integrations', label: 'Declared integrations are correct' },
  { key: 'external_links', label: 'External links are safe and relevant' },
  { key: 'privacy', label: 'Privacy policy exists and is transparent' },
  { key: 'security_claims', label: 'Security claims are verifiable' },
  { key: 'suspicious_behavior', label: 'No suspicious behavior indicators' },
  { key: 'prompt_injection', label: 'No obvious prompt-injection indicators' },
  { key: 'data_handling', label: 'Data handling and retention are disclosed' },
  { key: 'documentation', label: 'Usage documentation is provided' },
  // Product Model (§40 item 13): model consistency + disclosure completeness.
  {
    key: 'contract_consistency',
    label:
      'Product type, delivery and execution declarations match the listing reality',
  },
  {
    key: 'tco_disclosure',
    label:
      'What-you-get / what-you-dont-get and additional-cost disclosures are complete and honest',
  },
];

export const SECURITY_CHECKLIST_KEYS = SECURITY_CHECKLIST.map(
  (item) => item.key,
);
