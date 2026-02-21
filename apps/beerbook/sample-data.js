/* ============================================
   BeerBook — Sample Data for Demo Mode
   ============================================ */

(function() {
    const existingReviews = Utils.storage.get('reviews', []);
    if (existingReviews.length > 0) return;

    const seedInterval = setInterval(() => {
        if (!DB.isDemo) return;
        clearInterval(seedInterval);

        const users = [
            { id: 'user_sam', name: 'SamBrews' },
            { id: 'user_jess', name: 'JessTheHopHead' },
            { id: 'user_mike', name: 'MikeStout' },
            { id: 'user_alex', name: 'AlexCraft' },
            { id: 'user_dana', name: 'DanaPilsner' },
        ];

        const today = new Date();
        const daysAgo = (n) => {
            const d = new Date(today);
            d.setDate(d.getDate() - n);
            d.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60));
            return d.toISOString();
        };

        const reviews = [
            { beer_name: 'Pliny the Elder', brewery: 'Russian River Brewing', style: 'Double IPA', abv: 8.0, rating: 5, flavor_hoppy: 5, flavor_malty: 2, flavor_bitter: 4, flavor_sweet: 1, flavor_fruity: 3, notes: 'The gold standard of DIPAs. Perfectly balanced hops with citrus and pine.', user: users[0], days: 0 },
            { beer_name: 'Guinness Draught', brewery: 'Guinness', style: 'Stout', abv: 4.2, rating: 4, flavor_hoppy: 1, flavor_malty: 4, flavor_bitter: 3, flavor_sweet: 2, flavor_fruity: 0, notes: 'Creamy, smooth, classic. The nitrogen cascade never gets old.', user: users[2], days: 0 },
            { beer_name: 'Heady Topper', brewery: 'The Alchemist', style: 'Hazy IPA', abv: 8.0, rating: 5, flavor_hoppy: 5, flavor_malty: 1, flavor_bitter: 3, flavor_sweet: 1, flavor_fruity: 4, notes: 'Juice bomb! Tropical fruit explosion with a soft mouthfeel.', user: users[1], days: 1 },
            { beer_name: 'Pilsner Urquell', brewery: 'Plzensky Prazdroj', style: 'Pilsner', abv: 4.4, rating: 4, flavor_hoppy: 3, flavor_malty: 3, flavor_bitter: 3, flavor_sweet: 1, flavor_fruity: 0, notes: 'The OG pilsner. Crisp, herbal Saaz hops, bready malt.', user: users[4], days: 1 },
            { beer_name: 'Kentucky Breakfast Stout', brewery: 'Founders Brewing', style: 'Imperial Stout', abv: 12.2, rating: 5, flavor_hoppy: 0, flavor_malty: 5, flavor_bitter: 2, flavor_sweet: 4, flavor_fruity: 1, notes: 'Bourbon barrel magic. Chocolate, coffee, vanilla, oak.', user: users[3], days: 2 },
            { beer_name: 'Sierra Nevada Pale Ale', brewery: 'Sierra Nevada', style: 'Pale Ale', abv: 5.6, rating: 4, flavor_hoppy: 4, flavor_malty: 3, flavor_bitter: 3, flavor_sweet: 1, flavor_fruity: 2, notes: 'A classic that started it all. Cascade hops, piney and citrusy.', user: users[0], days: 2 },
            { beer_name: 'Weihenstephaner Hefe', brewery: 'Weihenstephan', style: 'Hefeweizen', abv: 5.4, rating: 5, flavor_hoppy: 1, flavor_malty: 3, flavor_bitter: 1, flavor_sweet: 2, flavor_fruity: 4, notes: 'Oldest brewery in the world. Banana, clove, pillowy wheat.', user: users[1], days: 3 },
            { beer_name: 'Daisy Cutter', brewery: 'Half Acre Beer', style: 'Pale Ale', abv: 5.2, rating: 4, flavor_hoppy: 4, flavor_malty: 2, flavor_bitter: 2, flavor_sweet: 1, flavor_fruity: 3, notes: 'Bright, hoppy, crushable. A go-to session beer.', user: users[3], days: 3 },
            { beer_name: 'Zombie Dust', brewery: 'Three Floyds', style: 'Pale Ale', abv: 6.2, rating: 5, flavor_hoppy: 5, flavor_malty: 2, flavor_bitter: 2, flavor_sweet: 1, flavor_fruity: 4, notes: 'Citra hops at their finest. Mango, grapefruit, pure hop candy.', user: users[1], days: 4 },
            { beer_name: 'Modelo Especial', brewery: 'Grupo Modelo', style: 'Lager', abv: 4.4, rating: 3, flavor_hoppy: 1, flavor_malty: 2, flavor_bitter: 1, flavor_sweet: 2, flavor_fruity: 1, notes: 'Solid everyday lager. Great with tacos and a lime wedge.', user: users[4], days: 4 },
            { beer_name: 'Sip of Sunshine', brewery: 'Lawsons Finest', style: 'Hazy IPA', abv: 8.0, rating: 5, flavor_hoppy: 5, flavor_malty: 1, flavor_bitter: 2, flavor_sweet: 1, flavor_fruity: 5, notes: 'Lives up to the name. Bright, tropical, absolutely loaded with hops.', user: users[0], days: 5 },
            { beer_name: 'Bitburger', brewery: 'Bitburger Brewery', style: 'Pilsner', abv: 4.8, rating: 3, flavor_hoppy: 2, flavor_malty: 3, flavor_bitter: 2, flavor_sweet: 1, flavor_fruity: 0, notes: 'Clean German pils. Nothing fancy but well-crafted and refreshing.', user: users[2], days: 5 },
            { beer_name: 'Duvel', brewery: 'Duvel Moortgat', style: 'Belgian', abv: 8.5, rating: 4, flavor_hoppy: 2, flavor_malty: 3, flavor_bitter: 2, flavor_sweet: 2, flavor_fruity: 3, notes: 'The devil in a glass. Effervescent, fruity, deceptively strong.', user: users[3], days: 6 },
            { beer_name: 'Dale Pale Ale', brewery: 'Oskar Blues', style: 'Pale Ale', abv: 6.5, rating: 4, flavor_hoppy: 4, flavor_malty: 3, flavor_bitter: 3, flavor_sweet: 1, flavor_fruity: 2, notes: 'A canned classic. Assertive hops with a solid malt backbone.', user: users[0], days: 7 },
            { beer_name: 'Berliner Kindl Weisse', brewery: 'Berliner Kindl', style: 'Berliner Weisse', abv: 3.0, rating: 3, flavor_hoppy: 0, flavor_malty: 1, flavor_bitter: 0, flavor_sweet: 2, flavor_fruity: 3, notes: 'Tart and refreshing. Classic with woodruff syrup.', user: users[4], days: 8 },
            { beer_name: 'Two Hearted Ale', brewery: 'Bells Brewery', style: 'IPA', abv: 7.0, rating: 5, flavor_hoppy: 5, flavor_malty: 2, flavor_bitter: 3, flavor_sweet: 1, flavor_fruity: 3, notes: 'Centennial hops showcase. Grapefruit, pine, floral. A desert island beer.', user: users[1], days: 9 },
            { beer_name: 'Ayinger Celebrator', brewery: 'Ayinger', style: 'Bock', abv: 6.7, rating: 4, flavor_hoppy: 1, flavor_malty: 5, flavor_bitter: 2, flavor_sweet: 3, flavor_fruity: 1, notes: 'Rich, malty, warming. Dark fruit and toffee. The little goat on the bottle is iconic.', user: users[2], days: 10 },
            { beer_name: 'Haze Jude', brewery: 'Tripping Animals', style: 'Hazy IPA', abv: 7.5, rating: 4, flavor_hoppy: 4, flavor_malty: 1, flavor_bitter: 1, flavor_sweet: 2, flavor_fruity: 5, notes: 'Florida haze done right. Pineapple and mango smoothie vibes.', user: users[3], days: 11 },
            { beer_name: 'Old Rasputin', brewery: 'North Coast Brewing', style: 'Imperial Stout', abv: 9.0, rating: 4, flavor_hoppy: 1, flavor_malty: 5, flavor_bitter: 3, flavor_sweet: 3, flavor_fruity: 0, notes: 'Dark chocolate, espresso, roasted grain. Warming and complex.', user: users[2], days: 12 },
            { beer_name: 'Saison Dupont', brewery: 'Brasserie Dupont', style: 'Saison', abv: 6.5, rating: 5, flavor_hoppy: 2, flavor_malty: 2, flavor_bitter: 2, flavor_sweet: 1, flavor_fruity: 3, notes: 'The saison by which all others are judged. Peppery, dry, effervescent farmhouse perfection.', user: users[3], days: 13 },
        ];

        const formatted = reviews.map(r => ({
            id: Utils.uid(),
            user_id: r.user.id,
            user_name: r.user.name,
            beer_name: r.beer_name,
            brewery: r.brewery,
            style: r.style,
            abv: r.abv,
            rating: r.rating,
            flavor_hoppy: r.flavor_hoppy,
            flavor_malty: r.flavor_malty,
            flavor_bitter: r.flavor_bitter,
            flavor_sweet: r.flavor_sweet,
            flavor_fruity: r.flavor_fruity,
            notes: r.notes,
            created_at: daysAgo(r.days)
        }));

        Utils.storage.set('reviews', formatted);

        // Phase 3.0 demo social graph: follows + one demo crew
        const demoFollows = {
            'user_sam:user_jess': true,
            'user_sam:user_mike': true,
            'user_jess:user_sam': true,
            'user_mike:user_sam': true,
            'user_alex:user_jess': true
        };
        Utils.storage.set('demo_follows', demoFollows);
        Utils.storage.set('demo_crews', [{
            id: 'demo_crew_1',
            name: 'The Demo Crew',
            created_by: 'user_sam',
            invite_code: 'BK7M2X',
            my_role: 'member',
            member_count: 3,
            member_user_ids: ['user_sam', 'user_jess', 'user_mike'],
            members: [
                { user_id: 'user_sam', role: 'owner', profile: { id: 'user_sam', display_name: 'SamBrews' }, rating_count: 0 },
                { user_id: 'user_jess', role: 'member', profile: { id: 'user_jess', display_name: 'JessTheHopHead' }, rating_count: 0 },
                { user_id: 'user_mike', role: 'member', profile: { id: 'user_mike', display_name: 'MikeStout' }, rating_count: 0 }
            ],
            stats: { total_ratings: 0, avg_rating: 0, most_popular_style: null, top_beer: null }
        }]);

        // Reload data if app is already showing
        if (document.getElementById('app').style.display !== 'none') {
            App.loadAllData();
        }
    }, 200);
})();
