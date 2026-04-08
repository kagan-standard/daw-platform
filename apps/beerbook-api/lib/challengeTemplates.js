/**
 * Canonical list of all weekly challenge templates.
 * Used by admin UI to populate the weekly challenge picker.
 */

const CHALLENGE_TEMPLATES = [
  {
    id: 'ratings_count',
    metric: 'ratings_count',
    label: 'Most Unique Beers Rated',
    description: 'Which crew rates the most distinct beers this week?',
    defaultTarget: 15,
    targetStyle: null,
  },
  {
    id: 'styles_count',
    metric: 'styles_count',
    label: 'Most Styles Rated',
    description: 'Which crew rates the widest variety of beer styles?',
    defaultTarget: 8,
    targetStyle: null,
  },
  {
    id: 'venue_checkins',
    metric: 'venue_checkins',
    label: 'Most Verified Venue Check-ins',
    description: 'Which crew hits the most venues this week?',
    defaultTarget: 10,
    targetStyle: null,
  },
  {
    id: 'tabs_earned',
    metric: 'tabs_earned',
    label: 'Most Tabs Earned',
    description: 'Which crew earns the most tabs — however they do it?',
    defaultTarget: 200,
    targetStyle: null,
  },
  {
    id: 'tabs_spent',
    metric: 'tabs_spent',
    label: 'Most Tabs Spent in Rewards Shop',
    description: 'Which crew goes hardest in the rewards shop?',
    defaultTarget: 100,
    targetStyle: null,
  },
  {
    id: 'members_added',
    metric: 'members_added',
    label: 'Most Crew Members Added',
    description: 'Which crew grows the fastest this week?',
    defaultTarget: 3,
    targetStyle: null,
  },
  {
    id: 'backs_risen',
    metric: 'backs_risen',
    label: 'Best Backers',
    description: 'Which crew backed the most beers that rose an ELO tier?',
    defaultTarget: 3,
    targetStyle: null,
  },
  {
    id: 'photos_submitted',
    metric: 'photos_submitted',
    label: 'Most Photos Submitted',
    description: 'Which crew documents their drinking the best?',
    defaultTarget: 10,
    targetStyle: null,
  },
  {
    id: 'beers_added',
    metric: 'beers_added',
    label: 'Most New Beers Added',
    description: 'Which crew discovers and adds the most new beers to BeerBook?',
    defaultTarget: 5,
    targetStyle: null,
  },
  {
    id: 'price_taggings',
    metric: 'price_taggings',
    label: 'Most Price Tags',
    description: 'Which crew helps the community find the best deals?',
    defaultTarget: 10,
    targetStyle: null,
  },
];

function getTemplate(id) {
  return CHALLENGE_TEMPLATES.find(t => t.id === id) || null;
}

module.exports = { CHALLENGE_TEMPLATES, getTemplate };
