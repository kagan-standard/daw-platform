-- Admin-curated "Beer of the Week" picks. highlights.js prefers this over auto-computed when present for current week.
CREATE TABLE IF NOT EXISTS public.featured_beers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beer_id text NULL,
  beer_name text NOT NULL,
  brewery text,
  style text,
  feature_type text NOT NULL DEFAULT 'beer_of_the_week',
  week_start timestamptz NOT NULL,
  week_end timestamptz NOT NULL,
  headline text,
  body text,
  photo_url text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featured_beers_range CHECK (week_end > week_start)
);

-- Optional FK if beers table exists and has id (text). Omit if beers.id is uuid to avoid type mismatch.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'beers')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'beers' AND column_name = 'id')
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'featured_beers_beer_id_fkey'
    ) THEN
      ALTER TABLE public.featured_beers
        ADD CONSTRAINT featured_beers_beer_id_fkey
        FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_beers_week
  ON public.featured_beers (feature_type, week_start);

COMMENT ON TABLE public.featured_beers IS 'Admin-curated beer-of-the-week picks; service_role only.';

ALTER TABLE public.featured_beers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS featured_beers_service_role ON public.featured_beers;
CREATE POLICY featured_beers_service_role ON public.featured_beers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
