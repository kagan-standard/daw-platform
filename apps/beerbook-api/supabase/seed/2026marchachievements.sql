-- BeerBook seed: 6 categories + 76 achievements
-- Matches your schema:
--   achievement_categories(key, name, icon, sort_order)
--   achievements(id, key UNIQUE, name, description, category_key FK, subtype, trigger_type, rules jsonb,
--               is_hidden, difficulty, reward_tabs, active, version, created_at)

BEGIN;

-- -------------------------------------------------------------------
-- 1) Categories (6)
-- -------------------------------------------------------------------
INSERT INTO public.achievement_categories (key, name, icon, sort_order)
VALUES
  ('starter',  'Starter',  'sparkles', 10),
  ('ratings',  'Ratings & Reviews', 'pen-line', 20),
  ('styles',   'Styles & Variety', 'layers', 30),
  ('venues',   'Venues & Exploration', 'map-pin', 40),
  ('social',   'Social', 'users', 50),
  ('streaks',  'Streaks & Specials', 'flame', 60)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- Helper: standard fields we’ll reuse conceptually:
-- subtype: progress | quality | exploration | social | streak | special
-- trigger_type: rating_submitted | cheers_given | cheers_received | profile_updated | follow_created | follow_received | rating_shared
-- rules: JSON your engine can interpret now or later (seed is safe either way)

-- -------------------------------------------------------------------
-- 2) Achievements (76)
-- Note: ON CONFLICT updates allow re-running safely.
-- -------------------------------------------------------------------

-- =======================
-- STARTER (13)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('first_pour', 'First Pour', 'Log your first beer rating.', 'starter', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":1}', false, 'easy', 5, true, 1),
('profile_polish', 'Profile Polish', 'Complete your profile basics (name/avatar).', 'starter', 'quality', 'profile_updated', '{"type":"profile_complete"}', false, 'easy', 3, true, 1),
('first_photo', 'Receipt of Proof', 'Upload your first beer photo.', 'starter', 'quality', 'rating_submitted', '{"type":"has_field","field":"photo","value":true}', false, 'easy', 4, true, 1),
('first_notes', 'First Notes', 'Write your first tasting notes.', 'starter', 'quality', 'rating_submitted', '{"type":"min_length","field":"review","gte":40}', false, 'easy', 4, true, 1),
('first_price', 'Price Tagger', 'Add a price to a rating for the first time.', 'starter', 'quality', 'rating_submitted', '{"type":"has_field","field":"price","value":true}', false, 'easy', 2, true, 1),
('first_location', 'On The Map', 'Attach a venue/location to a rating for the first time.', 'starter', 'exploration', 'rating_submitted', '{"type":"has_field","field":"venue_id","value":true}', false, 'easy', 3, true, 1),
('five_ratings', 'Five O’Clock Somewhere', 'Log 5 ratings.', 'starter', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":5}', false, 'easy', 6, true, 1),
('ten_ratings', 'Regular', 'Log 10 ratings.', 'starter', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":10}', false, 'easy', 10, true, 1),
('twentyfive_ratings', 'Known Face', 'Log 25 ratings.', 'starter', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":25}', false, 'medium', 15, true, 1),
('fifty_ratings', 'House Account', 'Log 50 ratings.', 'starter', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":50}', false, 'medium', 20, true, 1),
('first_new_beer', 'Trailblazer', 'Rate a beer that is new to you.', 'starter', 'special', 'rating_submitted', '{"type":"flag_true","field":"is_new_beer"}', false, 'easy', 5, true, 1),
('first_five_star', 'Perfect Pour', 'Give your first top-tier YG rating (YG ≥ 5).', 'starter', 'special', 'rating_submitted', '{"type":"comparison","field":"yg_value","op":">=","value":5}', false, 'easy', 5, true, 1),
('first_one_star', 'Brutal Honesty', 'Give your first low YG rating (YG ≤ -2).', 'starter', 'special', 'rating_submitted', '{"type":"comparison","field":"yg_value","op":"<=","value":-2}', false, 'easy', 3, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- =======================
-- RATINGS & REVIEWS (13)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('photo_fanatic_10', 'Photo Fanatic', 'Upload photos on 10 ratings.', 'ratings', 'quality', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"photo":true},"gte":10}', false, 'medium', 10, true, 1),
('notes_10', 'Tasting Journal', 'Write tasting notes on 10 ratings.', 'ratings', 'quality', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"review_min_len":40},"gte":10}', false, 'medium', 12, true, 1),
('notes_50', 'Beer Critic', 'Write tasting notes on 50 ratings.', 'ratings', 'quality', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"review_min_len":40},"gte":50}', false, 'hard', 25, true, 1),
('priced_10', 'Value Spotter', 'Add price to 10 ratings.', 'ratings', 'quality', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"price":true},"gte":10}', false, 'medium', 8, true, 1),
('location_10', 'Stamped Passport', 'Add a venue/location to 10 ratings.', 'ratings', 'exploration', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"venue_id":true},"gte":10}', false, 'medium', 10, true, 1),
('full_house', 'Full House Rating', 'Submit a rating with photo + notes + price + venue.', 'ratings', 'quality', 'rating_submitted', '{"type":"all_fields","fields":["photo","review","price","venue_id"]}', false, 'medium', 12, true, 1),
('three_in_a_day', 'Flight Board', 'Log 3 ratings in one day (reasonable).', 'ratings', 'special', 'rating_submitted', '{"type":"count_in_window","entity":"ratings","window":"day","gte":3}', false, 'easy', 8, true, 1),
('five_in_a_day', 'Tasting Day', 'Log 5 ratings in one day.', 'ratings', 'special', 'rating_submitted', '{"type":"count_in_window","entity":"ratings","window":"day","gte":5}', false, 'medium', 12, true, 1),
('consistent_rater_7', 'One a Day', 'Log at least 1 rating each day for 7 days.', 'ratings', 'streak', 'rating_submitted', '{"type":"daily_streak","entity":"ratings","days":7}', false, 'hard', 15, true, 1),
('top_shelf_10', 'Top Shelf', 'Give 10 beers a YG of 4 or higher.', 'ratings', 'progress', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"yg_gte":4},"gte":10}', false, 'medium', 10, true, 1),
('harsh_10', 'No Free Passes', 'Give 10 beers a YG of -1 or lower.', 'ratings', 'progress', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"yg_lte":-1},"gte":10}', false, 'medium', 8, true, 1),
('balanced_palette', 'Balanced Palate', 'Have at least 10 ratings in each YG bucket: low (≤-1), mid (1–2), high (≥3).', 'ratings', 'special', 'rating_submitted', '{"type":"distribution","entity":"ratings","buckets":[{"yg_lte":-1,"gte":10},{"yg_gte":1,"yg_lte":2,"gte":10},{"yg_gte":3,"gte":10}]}', false, 'hard', 20, true, 1),
('hundred_ratings', 'Archive Builder', 'Log 100 total ratings.', 'ratings', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":100}', false, 'hard', 30, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- =======================
-- STYLES & VARIETY (13)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('style_sampler_5', 'Style Sampler', 'Rate beers from 5 different styles.', 'styles', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"style","gte":5}', false, 'easy', 8, true, 1),
('style_sampler_10', 'Wide Net', 'Rate beers from 10 different styles.', 'styles', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"style","gte":10}', false, 'medium', 15, true, 1),
('lager_loyalist_10', 'Lager Loyalist', 'Rate 10 lagers.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_family_count","family":"lager","gte":10}', false, 'medium', 10, true, 1),
('ale_adventurer_10', 'Ale Adventurer', 'Rate 10 ales.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_family_count","family":"ale","gte":10}', false, 'medium', 10, true, 1),
('hop_head_10', 'Hop Head', 'Rate 10 IPAs (any IPA sub-style).', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains","needle":"IPA","gte":10}', false, 'medium', 12, true, 1),
('stout_scout_10', 'Stout Scout', 'Rate 10 stouts.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains","needle":"Stout","gte":10}', false, 'medium', 12, true, 1),
('sour_power_10', 'Sour Power', 'Rate 10 sour beers.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains_any","needles":["Sour","Gose","Berliner"],"gte":10}', false, 'medium', 14, true, 1),
('wheat_wave_10', 'Wheat Wave', 'Rate 10 wheat beers.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains_any","needles":["Wheat","Hefeweizen","Witbier"],"gte":10}', false, 'medium', 10, true, 1),
('belgian_detour_10', 'Belgian Detour', 'Rate 10 Belgian-style beers.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains","needle":"Belgian","gte":10}', false, 'hard', 14, true, 1),
('dark_side_25', 'The Dark Side', 'Rate 25 stouts/porters.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains_any","needles":["Stout","Porter"],"gte":25}', false, 'hard', 20, true, 1),
('crisp_committee_25', 'Crisp Committee', 'Rate 25 lagers/pils/kolsch.', 'styles', 'exploration', 'rating_submitted', '{"type":"style_contains_any","needles":["Lager","Pilsner","Kölsch"],"gte":25}', false, 'hard', 20, true, 1),
('seasonal_sampler_12', 'Seasonal Sampler', 'Rate beers across 12 different months.', 'styles', 'special', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"month","gte":12}', false, 'hard', 25, true, 1),
('style_completionist_25', 'Completionist', 'Rate beers from 25 different styles.', 'styles', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"style","gte":25}', false, 'hard', 35, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- =======================
-- VENUES & EXPLORATION (13)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('first_venue', 'First Seat', 'Rate a beer at a venue for the first time.', 'venues', 'exploration', 'rating_submitted', '{"type":"has_field","field":"venue_id","value":true}', false, 'easy', 4, true, 1),
('venue_hopper_5', 'Venue Hopper', 'Rate beers at 5 different venues.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"venue_id","gte":5}', false, 'easy', 10, true, 1),
('venue_hopper_10', 'Local Circuit', 'Rate beers at 10 different venues.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"venue_id","gte":10}', false, 'medium', 18, true, 1),
('brewery_run_5', 'Brewery Run', 'Rate beers at 5 breweries/brewpubs.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count_where","entity":"ratings","field":"venue_id","where":{"venue_type":"brewery"},"gte":5}', false, 'medium', 15, true, 1),
('new_city', 'Out of Town', 'Rate a beer in a new city.', 'venues', 'special', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"city","gte":2}', false, 'easy', 8, true, 1),
('three_cities', 'Road Taster', 'Rate beers in 3 different cities.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"city","gte":3}', false, 'medium', 15, true, 1),
('five_cities', 'Weekend Warrior', 'Rate beers in 5 different cities.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"city","gte":5}', false, 'hard', 25, true, 1),
('map_explorer_25', 'Map Explorer', 'Add venue/location to 25 ratings.', 'venues', 'exploration', 'rating_submitted', '{"type":"count_where","entity":"ratings","where":{"venue_id":true},"gte":25}', false, 'hard', 20, true, 1),
('home_base_10', 'Home Base', 'Rate 10 beers at the same venue.', 'venues', 'streak', 'rating_submitted', '{"type":"repeat_same","entity":"ratings","field":"venue_id","gte":10}', false, 'medium', 15, true, 1),
('brewery_loyalty_10', 'Brewery Regular', 'Rate 10 beers at the same brewery.', 'venues', 'streak', 'rating_submitted', '{"type":"repeat_same_where","entity":"ratings","field":"venue_id","where":{"venue_type":"brewery"},"gte":10}', false, 'hard', 20, true, 1),
('late_night_log', 'Last Call', 'Log a rating late night (10pm–2am local).', 'venues', 'special', 'rating_submitted', '{"type":"time_window","start":"22:00","end":"02:00"}', false, 'easy', 6, true, 1),
('happy_hour_hunter', 'Happy Hour Hunter', 'Log a rating during 4–7pm local.', 'venues', 'special', 'rating_submitted', '{"type":"time_window","start":"16:00","end":"19:00"}', false, 'easy', 6, true, 1),
('venue_completionist_25', 'Venue Completionist', 'Rate beers at 25 different venues.', 'venues', 'exploration', 'rating_submitted', '{"type":"distinct_count","entity":"ratings","field":"venue_id","gte":25}', false, 'hard', 35, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- =======================
-- SOCIAL (12)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('first_cheers_given', 'First Cheers', 'Give your first cheers.', 'social', 'social', 'cheers_given', '{"type":"count","entity":"cheers_given","gte":1}', false, 'easy', 3, true, 1),
('first_cheers_received', 'Somebody Noticed', 'Receive your first cheers.', 'social', 'social', 'cheers_received', '{"type":"count","entity":"cheers_received","gte":1}', false, 'easy', 3, true, 1),
('cheers_giver_10', 'Hype Person', 'Give 10 cheers.', 'social', 'social', 'cheers_given', '{"type":"count","entity":"cheers_given","gte":10}', false, 'easy', 8, true, 1),
('cheers_receiver_10', 'Crowd Favorite', 'Receive 10 cheers.', 'social', 'social', 'cheers_received', '{"type":"count","entity":"cheers_received","gte":10}', false, 'medium', 10, true, 1),
('cheers_giver_50', 'The Amplifier', 'Give 50 cheers.', 'social', 'social', 'cheers_given', '{"type":"count","entity":"cheers_given","gte":50}', false, 'hard', 20, true, 1),
('cheers_receiver_50', 'Local Legend', 'Receive 50 cheers.', 'social', 'social', 'cheers_received', '{"type":"count","entity":"cheers_received","gte":50}', false, 'hard', 25, true, 1),
('cheers_spread', 'Good Vibes', 'Cheers 10 different users.', 'social', 'social', 'cheers_given', '{"type":"distinct_count","entity":"cheers_given","field":"to_user_id","gte":10}', false, 'medium', 12, true, 1),
('mutual_cheers', 'Mutual Respect', 'Exchange cheers with the same person (give + receive).', 'social', 'social', 'cheers_received', '{"type":"mutual_pair"}', false, 'hard', 10, true, 1),
('first_follow', 'First Follow', 'Follow your first user.', 'social', 'social', 'follow_created', '{"type":"count","entity":"follows","gte":1}', false, 'easy', 2, true, 1),
('followers_10', 'Noticed', 'Get 10 followers.', 'social', 'social', 'follow_received', '{"type":"count","entity":"followers","gte":10}', false, 'medium', 10, true, 1),
('following_25', 'Connector', 'Follow 25 users.', 'social', 'social', 'follow_created', '{"type":"count","entity":"follows","gte":25}', false, 'hard', 12, true, 1),
('share_rating', 'Share The Pour', 'Share a rating.', 'social', 'social', 'rating_shared', '{"type":"count","entity":"shares","gte":1}', false, 'easy', 3, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- =======================
-- STREAKS & SPECIALS (12)
-- =======================
INSERT INTO public.achievements
(key, name, description, category_key, subtype, trigger_type, rules, is_hidden, difficulty, reward_tabs, active, version)
VALUES
('weekly_streak_2', 'Two-Week Run', 'Log at least 1 rating per week for 2 weeks.', 'streaks', 'streak', 'rating_submitted', '{"type":"weekly_streak","weeks":2}', false, 'medium', 10, true, 1),
('weekly_streak_4', 'Month of Beer', 'Log at least 1 rating per week for 4 weeks.', 'streaks', 'streak', 'rating_submitted', '{"type":"weekly_streak","weeks":4}', false, 'hard', 20, true, 1),
('daily_streak_3', 'Mini Streak', 'Log 1 rating per day for 3 days.', 'streaks', 'streak', 'rating_submitted', '{"type":"daily_streak","days":3}', false, 'easy', 6, true, 1),
('daily_streak_14', 'Two-Week Streak', 'Log 1 rating per day for 14 days.', 'streaks', 'streak', 'rating_submitted', '{"type":"daily_streak","days":14}', false, 'hard', 30, true, 1),
('week_cap_master', 'Cap Master', 'Hit the weekly cap (10 qualifying ratings in a week).', 'streaks', 'special', 'rating_submitted', '{"type":"weekly_cap_hit","cap":10}', false, 'hard', 20, true, 1),
('dry_spell_breaker', 'Back In The Saddle', 'Return after 30+ days without a rating.', 'streaks', 'special', 'rating_submitted', '{"type":"gap_days","gte":30}', false, 'easy', 8, true, 1),
('seasonal_fall', 'Autumn Sips', 'Log 10 ratings in Sep–Nov.', 'streaks', 'special', 'rating_submitted', '{"type":"season_window","months":[9,10,11],"gte":10}', false, 'medium', 12, true, 1),
('seasonal_winter', 'Winter Warmers', 'Log 10 ratings in Dec–Feb.', 'streaks', 'special', 'rating_submitted', '{"type":"season_window","months":[12,1,2],"gte":10}', false, 'medium', 12, true, 1),
('seasonal_spring', 'Spring Refresh', 'Log 10 ratings in Mar–May.', 'streaks', 'special', 'rating_submitted', '{"type":"season_window","months":[3,4,5],"gte":10}', false, 'medium', 12, true, 1),
('seasonal_summer', 'Summer Session', 'Log 10 ratings in Jun–Aug.', 'streaks', 'special', 'rating_submitted', '{"type":"season_window","months":[6,7,8],"gte":10}', false, 'medium', 12, true, 1),
('new_beer_week', 'New Beer Week', 'Rate 5 new-to-you beers in a week.', 'streaks', 'special', 'rating_submitted', '{"type":"count_where_in_window","where":{"is_new_beer":true},"window":"week","gte":5}', false, 'hard', 18, true, 1),
('milestone_250', 'Quarter Keg', 'Log 250 ratings.', 'streaks', 'progress', 'rating_submitted', '{"type":"count","entity":"ratings","gte":250}', false, 'hard', 50, true, 1)
ON CONFLICT (key) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description,
    category_key=EXCLUDED.category_key,
    subtype=EXCLUDED.subtype,
    trigger_type=EXCLUDED.trigger_type,
    rules=EXCLUDED.rules,
    is_hidden=EXCLUDED.is_hidden,
    difficulty=EXCLUDED.difficulty,
    reward_tabs=EXCLUDED.reward_tabs,
    active=EXCLUDED.active,
    version=EXCLUDED.version;

-- -------------------------------------------------------------------
-- 3) Sanity checks
-- -------------------------------------------------------------------
-- Expect: 6 categories, 76 achievements
-- SELECT count(*) FROM public.achievement_categories;
-- SELECT count(*) FROM public.achievements;

COMMIT;