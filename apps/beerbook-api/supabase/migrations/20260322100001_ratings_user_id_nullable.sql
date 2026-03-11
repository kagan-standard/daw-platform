-- Guest ratings (v1): allow user_id NULL for guest-owned rows.
-- Run second, after 20260322100000_ratings_guest_owner_columns.

ALTER TABLE ratings ALTER COLUMN user_id DROP NOT NULL;
