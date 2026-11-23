import { expandCategorySlugs } from './categories.service';

describe('expandCategorySlugs (Taxonomy v2 hierarchy)', () => {
  const tree = [
    { slug: 'developer-tools', parentSlug: null },
    { slug: 'programming-agents', parentSlug: 'developer-tools' },
    { slug: 'software-testing', parentSlug: 'developer-tools' },
    { slug: 'finance', parentSlug: null },
  ];

  it('a parent expands to itself plus its subcategories', () => {
    expect(expandCategorySlugs(['developer-tools'], tree).sort()).toEqual(
      ['developer-tools', 'programming-agents', 'software-testing'].sort(),
    );
  });

  it('a subcategory or a leaf stays as-is', () => {
    expect(expandCategorySlugs(['programming-agents'], tree)).toEqual([
      'programming-agents',
    ]);
    expect(expandCategorySlugs(['finance'], tree)).toEqual(['finance']);
  });

  it('unknown slugs pass through unchanged and duplicates collapse', () => {
    expect(
      expandCategorySlugs(['nope', 'finance', 'finance'], tree).sort(),
    ).toEqual(['finance', 'nope']);
  });
});
