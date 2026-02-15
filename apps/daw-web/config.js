// DAW Web runtime config (Phase 2)
window.DAW_CONFIG = {
    keycloak: {
        authority: 'https://auth.drinksafterwork.net/realms/daw',
        clientId: 'daw-web'
    },
    services: [
        {
            id: 'beerbook',
            name: 'BeerBook',
            desc: 'Rate & review beers with the crew',
            url: 'https://beerbook.drinksafterwork.net',
            icon: 'beer',
            status: 'live'
        },
        {
            id: 'chat',
            name: 'DAW Chat',
            desc: 'Encrypted group chat, powered by Matrix',
            url: 'https://element.drinksafterwork.net',
            icon: 'chat',
            status: 'live'
        },
        {
            id: 'football',
            name: 'DAW Fantasy Football',
            desc: 'League tracker & draft room',
            url: 'https://football.drinksafterwork.net',
            icon: 'football',
            status: 'coming-soon'
        }
    ]
};
