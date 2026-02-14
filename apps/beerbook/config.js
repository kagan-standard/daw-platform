// BeerBook runtime config (Phase 1: baked-in for beerbook.drinksafterwork.net)
window.BEERBOOK_CONFIG = {
    keycloak: {
        authority: 'https://auth.drinksafterwork.net/realms/daw',
        clientId: 'beerbook'
    },
    apiBaseUrl: 'https://api.beerbook.drinksafterwork.net'
};
