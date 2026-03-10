function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseContentRangeTotal(contentRange) {
  const text = String(contentRange || '');
  const match = text.match(/\/(\d+|\*)$/);
  if (!match || match[1] === '*') return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCountFromResponse(res, totalFromContentRange) {
  const fromHeader =
    typeof totalFromContentRange === 'function'
      ? totalFromContentRange(res.headers && res.headers['content-range'])
      : null;
  if (Number.isFinite(fromHeader)) return Math.max(Number(fromHeader), 0);

  const parsedHeader = parseContentRangeTotal(res.headers && res.headers['content-range']);
  if (Number.isFinite(parsedHeader)) return Math.max(parsedHeader, 0);

  if (Array.isArray(res.body)) return res.body.length;
  return 0;
}

function getTarget(rules, metric) {
  if (!rules || typeof rules !== 'object') return null;
  const directTarget = [
    rules.count,
    rules.gte,
    rules.min_count,
    rules.target,
    rules.min_checkins,
    rules.weeks,
  ]
    .map(numberOrNull)
    .find((n) => Number.isFinite(n) && n >= 0);

  if (Number.isFinite(directTarget)) return directTarget;

  if (metric === 'review_min_len' || metric === 'stars_gte' || metric === 'stars_lte' || metric === 'yg_gte' || metric === 'yg_lte' || metric === 'yg_eq' || metric === 'price') {
    return 1;
  }

  if (metric === 'distribution_yg') {
    const buckets = rules && Array.isArray(rules.buckets) ? rules.buckets : [];
    const firstBucketGte = buckets.length > 0 ? numberOrNull(buckets[0].gte) : null;
    return Number.isFinite(firstBucketGte) && firstBucketGte > 0 ? firstBucketGte : null;
  }

  return null;
}

function resolveMetricAndThreshold(subtype, rules) {
  const normalizedSubtype = String(subtype || '').trim().toLowerCase();
  const safeRules = rules && typeof rules === 'object' ? rules : {};

  const subtypeMetricMap = {
    checkin_count: 'total_ratings',
    total_ratings: 'total_ratings',
    unique_styles: 'unique_styles',
    unique_venues: 'unique_venues',
    review_min_len: 'review_min_len',
    stars_gte: 'stars_gte',
    stars_lte: 'stars_lte',
    price: 'price',
    cheers_given: 'cheers_given',
    cheers_received: 'cheers_received',
    streak_weeks: 'streak_weeks',
  };

  if (subtypeMetricMap[normalizedSubtype]) {
    const metric = subtypeMetricMap[normalizedSubtype];
    const threshold =
      metric === 'review_min_len'
        ? numberOrNull(safeRules.min_length ?? safeRules.review_min_len)
        : metric === 'stars_gte'
          ? numberOrNull(safeRules.stars)
          : metric === 'stars_lte'
            ? numberOrNull(safeRules.stars)
            : null;
    return { metric, threshold };
  }

  const type = String(safeRules.type || '').trim().toLowerCase();
  const entity = String(safeRules.entity || '').trim().toLowerCase();
  if (type === 'count' && entity === 'ratings') return { metric: 'total_ratings', threshold: null };
  if (type === 'rating_count' && entity === 'ratings') return { metric: 'total_ratings', threshold: null };

  if (type === 'distinct_count' && entity === 'ratings') {
    const field = String(safeRules.field || '').trim().toLowerCase();
    if (field === 'style') return { metric: 'unique_styles', threshold: null };
    if (field === 'venue_id') return { metric: 'unique_venues', threshold: null };
  }

  if (type === 'count' && entity === 'cheers_given') return { metric: 'cheers_given', threshold: null };
  if (type === 'count' && entity === 'cheers_received') return { metric: 'cheers_received', threshold: null };

  if (type === 'count_where' && entity === 'ratings') {
    const where = safeRules.where && typeof safeRules.where === 'object' ? safeRules.where : {};
    if (Number.isFinite(numberOrNull(where.review_min_len))) {
      return { metric: 'review_min_len', threshold: numberOrNull(where.review_min_len) };
    }
    if (Number.isFinite(numberOrNull(where.yg_gte))) {
      return { metric: 'yg_gte', threshold: numberOrNull(where.yg_gte) };
    }
    if (Number.isFinite(numberOrNull(where.yg_lte))) {
      return { metric: 'yg_lte', threshold: numberOrNull(where.yg_lte) };
    }
    if (Number.isFinite(numberOrNull(where.yg_eq))) {
      return { metric: 'yg_eq', threshold: numberOrNull(where.yg_eq) };
    }
    if (Number.isFinite(numberOrNull(where.stars_gte))) {
      return { metric: 'stars_gte', threshold: numberOrNull(where.stars_gte) };
    }
    if (Number.isFinite(numberOrNull(where.stars_lte))) {
      return { metric: 'stars_lte', threshold: numberOrNull(where.stars_lte) };
    }
    if (where.price === true) {
      return { metric: 'price', threshold: null };
    }
  }

  if (type === 'distribution' && entity === 'ratings' && Array.isArray(safeRules.buckets)) {
    const buckets = safeRules.buckets;
    const isYgDistribution = buckets.every(
      (b) => b && (Number.isFinite(numberOrNull(b.yg_gte)) || Number.isFinite(numberOrNull(b.yg_lte)) || Number.isFinite(numberOrNull(b.yg_eq)))
    );
    if (isYgDistribution) {
      return { metric: 'distribution_yg', threshold: null, buckets };
    }
  }

  if (type === 'has_field') {
    const field = String(safeRules.field || '').trim().toLowerCase();
    if (field === 'price') return { metric: 'price', threshold: null };
  }

  if (type === 'comparison') {
    const field = String(safeRules.field || '').trim().toLowerCase();
    const op = String(safeRules.op || '').trim();
    const value = numberOrNull(safeRules.value);
    if (!Number.isFinite(value)) return null;
    if ((field === 'yg' || field === 'yg_value') && op === '>=') return { metric: 'yg_gte', threshold: value };
    if ((field === 'yg' || field === 'yg_value') && op === '<=') return { metric: 'yg_lte', threshold: value };
    if ((field === 'yg' || field === 'yg_value') && (op === '=' || op === 'eq')) return { metric: 'yg_eq', threshold: value };
    if ((field === 'stars' || field === 'rating') && op === '>=') return { metric: 'stars_gte', threshold: value };
    if ((field === 'stars' || field === 'rating') && op === '<=') return { metric: 'stars_lte', threshold: value };
  }

  return null;
}

async function countRatings(rest, totalFromContentRange, userId, extraFilter) {
  const user = encodeURIComponent(userId);
  const filter = extraFilter ? `&${extraFilter}` : '';
  const res = await rest('GET', `/ratings?user_id=eq.${user}${filter}&select=id`, {
    headers: { Prefer: 'count=exact' },
  });
  if (res.status >= 400) return 0;
  return resolveCountFromResponse(res, totalFromContentRange);
}

async function countLedger(rest, totalFromContentRange, userId, eventType) {
  const user = encodeURIComponent(userId);
  const event = encodeURIComponent(eventType);
  const res = await rest('GET', `/tabs_ledger?user_id=eq.${user}&event_type=eq.${event}&select=id`, {
    headers: { Prefer: 'count=exact' },
  });
  if (res.status >= 400) return 0;
  return resolveCountFromResponse(res, totalFromContentRange);
}

async function countDistinctRatingsField(rest, userId, field) {
  const user = encodeURIComponent(userId);
  const column = encodeURIComponent(field);
  const res = await rest('GET', `/ratings?user_id=eq.${user}&${column}=not.is.null&select=${column}&limit=50000`);
  if (res.status >= 400) return 0;
  const rows = Array.isArray(res.body) ? res.body : [];
  return new Set(
    rows
      .map((row) => row && row[field])
      .filter((value) => value != null)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

async function countRatingsByReviewLength(rest, userId, minLength) {
  const user = encodeURIComponent(userId);
  const res = await rest('GET', `/ratings?user_id=eq.${user}&notes=not.is.null&select=notes&limit=50000`);
  if (res.status >= 400) return 0;
  const rows = Array.isArray(res.body) ? res.body : [];
  return rows.reduce((count, row) => {
    const notes = String((row && row.notes) || '').trim();
    return notes.length >= minLength ? count + 1 : count;
  }, 0);
}

async function getCurrentStreakWeeks(rest, userId) {
  const user = encodeURIComponent(userId);
  const res = await rest('GET', `/user_tabs_profile?user_id=eq.${user}&select=current_streak_weeks&limit=1`);
  if (res.status >= 400) return 0;
  const rows = Array.isArray(res.body) ? res.body : [];
  return Math.max(Number(rows[0] && rows[0].current_streak_weeks) || 0, 0);
}

async function calculateAchievementProgress({ rest, totalFromContentRange, user_id, rules, subtype }) {
  if (!rest || typeof rest !== 'function') return null;
  const userId = String(user_id || '').trim();
  if (!userId) return null;

  const metricConfig = resolveMetricAndThreshold(subtype, rules);
  if (!metricConfig) return null;

  const { metric, threshold, buckets: resolvedBuckets } = metricConfig;
  const target = getTarget(rules, metric);
  if (!Number.isFinite(target) || target <= 0) return null;

  let progressCurrent = 0;
  if (metric === 'total_ratings') {
    progressCurrent = await countRatings(rest, totalFromContentRange, userId);
  } else if (metric === 'unique_styles') {
    progressCurrent = await countDistinctRatingsField(rest, userId, 'style');
  } else if (metric === 'unique_venues') {
    progressCurrent = await countDistinctRatingsField(rest, userId, 'venue_id');
  } else if (metric === 'review_min_len') {
    const minLength = Number.isFinite(threshold) ? threshold : numberOrNull(rules && rules.min_length);
    if (!Number.isFinite(minLength)) return null;
    progressCurrent = await countRatingsByReviewLength(rest, userId, minLength);
  } else if (metric === 'stars_gte') {
    const stars = Number.isFinite(threshold) ? threshold : numberOrNull(rules && rules.stars);
    if (!Number.isFinite(stars)) return null;
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, `rating=gte.${encodeURIComponent(stars)}`);
  } else if (metric === 'stars_lte') {
    const stars = Number.isFinite(threshold) ? threshold : numberOrNull(rules && rules.stars);
    if (!Number.isFinite(stars)) return null;
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, `rating=lte.${encodeURIComponent(stars)}`);
  } else if (metric === 'price') {
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, 'price_cents=not.is.null');
  } else if (metric === 'cheers_given') {
    progressCurrent = await countLedger(rest, totalFromContentRange, userId, 'cheers_given');
  } else if (metric === 'cheers_received') {
    progressCurrent = await countLedger(rest, totalFromContentRange, userId, 'cheers_received');
  } else if (metric === 'yg_gte') {
    if (!Number.isFinite(threshold)) return null;
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, `yg_value=gte.${encodeURIComponent(threshold)}`);
  } else if (metric === 'yg_lte') {
    if (!Number.isFinite(threshold)) return null;
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, `yg_value=lte.${encodeURIComponent(threshold)}`);
  } else if (metric === 'yg_eq') {
    if (!Number.isFinite(threshold)) return null;
    progressCurrent = await countRatings(rest, totalFromContentRange, userId, `yg_value=eq.${encodeURIComponent(threshold)}`);
  } else if (metric === 'distribution_yg') {
    const dBuckets = resolvedBuckets || (rules && Array.isArray(rules.buckets) ? rules.buckets : []);
    if (!dBuckets.length) return null;
    const bucketCounts = [];
    for (const bucket of dBuckets) {
      const filters = [];
      const ygGte = numberOrNull(bucket.yg_gte);
      const ygLte = numberOrNull(bucket.yg_lte);
      const ygEq = numberOrNull(bucket.yg_eq);
      if (Number.isFinite(ygGte)) filters.push(`yg_value=gte.${encodeURIComponent(ygGte)}`);
      if (Number.isFinite(ygLte)) filters.push(`yg_value=lte.${encodeURIComponent(ygLte)}`);
      if (Number.isFinite(ygEq)) filters.push(`yg_value=eq.${encodeURIComponent(ygEq)}`);
      if (!filters.length) return null;
      const count = await countRatings(rest, totalFromContentRange, userId, filters.join('&'));
      bucketCounts.push(count);
    }
    progressCurrent = Math.min(...bucketCounts);
  } else if (metric === 'streak_weeks') {
    progressCurrent = await getCurrentStreakWeeks(rest, userId);
  } else {
    return null;
  }

  const normalizedCurrent = Math.max(Number(progressCurrent) || 0, 0);
  const normalizedTarget = Math.max(Number(target) || 0, 0);
  return {
    progress_current: normalizedCurrent,
    progress_target: normalizedTarget,
    remaining: Math.max(normalizedTarget - normalizedCurrent, 0),
  };
}

module.exports = {
  calculateAchievementProgress,
};
