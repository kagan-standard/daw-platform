<#import "footer.ftl" as loginFooter>
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="${locale.currentLanguageTag}" dir="${(locale.rtl)?then('rtl','ltr')}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))!''}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet"/>
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
</head>
<body class="daw-login-body ${bodyClass!''}">
<canvas id="stars-canvas" aria-hidden="true"></canvas>
<div class="daw-cityscape" aria-hidden="true">
    <svg viewBox="0 0 1440 400" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="cityGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0f1428"/><stop offset="100%" stop-color="#080a14"/></linearGradient></defs>
        <path fill="#0e1225" opacity="0.5" d="M0,400 L0,280 L30,280 L30,220 L50,220 L50,180 L65,180 L65,220 L90,220 L90,160 L110,160 L110,120 L125,120 L125,100 L140,100 L140,140 L160,140 L160,200 L190,200 L190,150 L210,150 L210,100 L225,100 L225,70 L240,70 L240,60 L255,60 L255,100 L280,100 L280,160 L310,160 L310,220 L340,220 L340,180 L360,180 L360,130 L375,130 L375,90 L390,90 L390,70 L405,70 L405,110 L430,110 L430,170 L460,170 L460,230 L490,230 L490,190 L510,190 L510,140 L525,140 L525,100 L540,100 L540,80 L555,80 L555,60 L570,60 L570,100 L590,100 L590,150 L620,150 L620,210 L650,210 L650,260 L680,260 L680,200 L700,200 L700,150 L715,150 L715,110 L730,110 L730,80 L745,80 L745,50 L760,50 L760,90 L780,90 L780,140 L810,140 L810,200 L840,200 L840,250 L870,250 L870,210 L890,210 L890,160 L910,160 L910,120 L925,120 L925,80 L940,80 L940,110 L960,110 L960,160 L990,160 L990,220 L1020,220 L1020,260 L1050,260 L1050,200 L1070,200 L1070,150 L1085,150 L1085,110 L1100,110 L1100,80 L1115,80 L1115,55 L1130,55 L1130,90 L1150,90 L1150,140 L1180,140 L1180,200 L1210,200 L1210,250 L1240,250 L1240,190 L1260,190 L1260,140 L1275,140 L1275,100 L1290,100 L1290,70 L1305,70 L1305,110 L1330,110 L1330,170 L1360,170 L1360,230 L1390,230 L1390,180 L1410,180 L1410,140 L1430,140 L1430,200 L1440,200 L1440,400 Z"/>
        <path fill="url(#cityGrad)" d="M0,400 L0,310 L25,310 L25,270 L45,270 L45,240 L60,240 L60,210 L75,210 L75,240 L95,240 L95,280 L120,280 L120,230 L135,230 L135,190 L150,190 L150,160 L170,170 L170,200 L195,200 L195,250 L220,250 L220,290 L245,290 L245,240 L260,260 L260,200 L275,200 L275,160 L290,160 L290,130 L310,130 L310,170 L335,170 L335,220 L360,220 L360,270 L385,270 L385,310 L410,310 L410,260 L425,260 L425,220 L440,220 L440,180 L455,180 L455,150 L475,150 L475,190 L500,190 L500,240 L525,240 L525,280 L550,280 L550,230 L565,230 L565,190 L580,190 L580,150 L595,150 L595,120 L615,120 L615,160 L640,160 L640,210 L665,210 L665,260 L690,260 L690,300 L715,300 L715,250 L730,250 L730,210 L745,210 L745,170 L760,170 L760,140 L780,140 L780,110 L795,110 L795,150 L820,150 L820,200 L845,200 L845,250 L870,250 L870,300 L895,300 L895,340 L920,340 L920,280 L935,280 L935,240 L950,240 L950,200 L965,200 L965,160 L985,160 L985,200 L1010,200 L1010,250 L1035,250 L1035,290 L1060,290 L1060,240 L1075,240 L1075,200 L1090,200 L1090,160 L1105,160 L1105,130 L1125,130 L1125,170 L1150,170 L1150,220 L1175,220 L1175,270 L1200,270 L1200,310 L1225,310 L1225,260 L1240,260 L1240,220 L1255,220 L1255,180 L1270,180 L1270,150 L1290,150 L1290,190 L1315,190 L1315,240 L1340,240 L1340,280 L1365,280 L1365,230 L1380,230 L1380,200 L1395,200 L1395,240 L1420,240 L1420,280 L1440,280 L1440,400 Z"/>
        <g fill="#f5b731">
            <rect x="52" y="220" width="5" height="7" rx="1" opacity="0.6"/><rect x="62" y="220" width="5" height="7" rx="1" opacity="0.3"/>
            <rect x="140" y="170" width="5" height="7" rx="1" opacity="0.7"/><rect x="150" y="170" width="5" height="7" rx="1" opacity="0.3"/>
            <rect x="293" y="140" width="5" height="7" rx="1" opacity="0.6"/><rect x="303" y="140" width="5" height="7" rx="1" opacity="0.4"/>
            <rect x="598" y="130" width="5" height="7" rx="1" opacity="0.7"/><rect x="608" y="130" width="5" height="7" rx="1" opacity="0.4"/>
            <rect x="968" y="170" width="5" height="7" rx="1" opacity="0.5"/><rect x="978" y="170" width="5" height="7" rx="1" opacity="0.7"/>
        </g>
    </svg>
</div>

<div class="daw-page">
    <div class="daw-logo-area">
        <#if url.resourcesPath??>
            <img src="${url.resourcesPath}/img/logo.jpg" alt="Drinks After Work" class="daw-logo-img" onerror="this.style.display='none'">
        </#if>
        <h1 class="daw-site-title">Drinks After Work</h1>
        <p class="daw-tagline">WHERE THE CREW LINKS UP</p>
    </div>

    <div class="daw-card-wrapper">
        <div class="daw-tabs">
            <#if url.loginUrl??>
                <a href="${url.loginUrl}" id="daw-tab-login" class="daw-tab">Sign In</a>
            </#if>
            <#if url.registrationUrl??>
                <a href="${url.registrationUrl}" id="daw-tab-register" class="daw-tab">Create Account</a>
            </#if>
        </div>

        <div class="daw-card">
            <#if displayMessage && message?? && message.summary?has_content && (message.type != 'warning' || !(isAppInitiatedAction?? && isAppInitiatedAction))>
                <div class="daw-alert daw-alert-${message.type!''}" role="alert">
                    ${kcSanitize(message.summary)?no_esc}
                </div>
            </#if>

            <#if realm.internationalizationEnabled && locale?? && locale.supported?? && locale.supported?size gt 1>
                <div class="daw-locale">
                    <#list locale.supported as l>
                        <a href="${l.url!''}" class="daw-locale-link <#if locale.current?? && locale.current == l.label>daw-locale-active</#if>">${l.label!''}</a><#if l_has_next> </#if>
                    </#list>
                </div>
            </#if>

            <#if !(auth?? && auth.showUsername?? && auth.showUsername() && !(auth.showResetCredentials?? && auth.showResetCredentials()))>
                <#if displayRequiredFields>
                    <p class="daw-required-hint">* ${msg("requiredFields")}</p>
                </#if>
                <#nested "header">
            <#else>
                <#if displayRequiredFields>
                    <p class="daw-required-hint">* ${msg("requiredFields")}</p>
                </#if>
                <#nested "show-username">
                <#if auth?? && auth.attemptedUsername??>
                    <p class="daw-username-display">${auth.attemptedUsername}</p>
                </#if>
                <#if url.loginRestartFlowUrl??>
                    <p><a href="${url.loginRestartFlowUrl}">${msg("restartLoginTooltip")}</a></p>
                </#if>
            </#if>

            <#nested "form">

            <#if auth?? && auth.showTryAnotherWayLink?? && auth.showTryAnotherWayLink()>
                <#if url.loginTryAnotherWayUrl??>
                    <p><a href="${url.loginTryAnotherWayUrl}">${msg("doTryAnotherWay")}</a></p>
                </#if>
            </#if>

            <#nested "socialProviders">

            <#if displayInfo>
                <#nested "info">
            </#if>
        </div>
    </div>

    <div class="daw-channel-pills">
        <span class="daw-pill">Politics</span>
        <span class="daw-pill">Gaming</span>
        <span class="daw-pill">Fantasy Football</span>
        <span class="daw-pill">General</span>
    </div>
</div>

<@loginFooter.content/>
<script>
(function() {
    var isRegister = document.getElementById('kc-register-form') != null;
    var loginTab = document.getElementById('daw-tab-login');
    var registerTab = document.getElementById('daw-tab-register');
    if (loginTab) loginTab.classList.toggle('daw-tab-active', !isRegister);
    if (registerTab) registerTab.classList.toggle('daw-tab-active', isRegister);
})();
</script>
<script>
(function() {
    var c = document.getElementById('stars-canvas');
    if (!c) return;
    var ctx = c.getContext('2d');
    var stars = [];
    function resize() { c.width = window.innerWidth; c.height = window.innerHeight; }
    function create() {
        stars = [];
        for (var i = 0; i < 180; i++) {
            stars.push({ x: Math.random() * c.width, y: Math.random() * c.height * 0.7, r: Math.random() * 1.5 + 0.3, speed: Math.random() * 0.02 + 0.005, phase: Math.random() * Math.PI * 2 });
        }
    }
    function draw(t) {
        if (!ctx) return;
        ctx.clearRect(0, 0, c.width, c.height);
        stars.forEach(function(s) {
            var tw = 0.4 + 0.6 * Math.sin(t * s.speed + s.phase);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,240,' + (tw * 0.8) + ')';
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    window.addEventListener('resize', function() { resize(); create(); });
    resize();
    create();
    requestAnimationFrame(draw);
})();
</script>
</body>
</html>
</#macro>
