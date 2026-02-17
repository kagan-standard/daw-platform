<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true displayInfo=(realm.password!false) && (realm.registrationAllowed!false); section>
    <#if section = "header">
        <h2 class="daw-form-title">${msg("loginAccountTitle")}</h2>
    <#elseif section = "form">
        <div id="kc-form" class="daw-form-inner">
            <div id="kc-form-wrapper">
                <#if realm.password!false>
                    <form id="kc-form-login" class="daw-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                        <#if !(usernameHidden?? && usernameHidden)>
                            <div class="daw-form-group">
                                <label for="username" class="daw-label">
                                    <#if !(realm.loginWithEmailAllowed!false)>
                                        ${msg("username")}
                                    <#elseif !(realm.registrationEmailAsUsername!false)>
                                        ${msg("usernameOrEmail")}
                                    <#else>
                                        ${msg("email")}
                                    </#if>
                                </label>
                                <input tabindex="2" id="username" class="daw-input" name="username" value="${(login.username!'')}" type="text"
                                       autofocus autocomplete="username"
                                       aria-invalid="<#if messagesPerField?? && messagesPerField.existsError('username','password')>true</#if>"
                                       dir="ltr" />
                                <#if messagesPerField?? && messagesPerField.existsError('username','password')>
                                    <span id="input-error" class="daw-input-error" aria-live="polite">
                                        ${kcSanitize(messagesPerField.getFirstError('username','password')!'')?no_esc}
                                    </span>
                                </#if>
                            </div>
                        </#if>

                        <div class="daw-form-group">
                            <label for="password" class="daw-label">${msg("password")}</label>
                            <div class="daw-input-group" dir="ltr">
                                <input tabindex="3" id="password" class="daw-input" name="password" type="password" autocomplete="current-password"
                                       aria-invalid="<#if messagesPerField?? && messagesPerField.existsError('username','password')>true</#if>" />
                                <button class="daw-password-toggle" type="button" aria-label="${msg("showPassword")}"
                                        aria-controls="password" data-password-toggle tabindex="4"
                                        data-icon-show="${properties.kcFormPasswordVisibilityIconShow!''}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!''}"
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                    <i class="${properties.kcFormPasswordVisibilityIconShow!''}" aria-hidden="true"></i>
                                </button>
                            </div>
                            <#if (usernameHidden?? && usernameHidden) && messagesPerField?? && messagesPerField.existsError('username','password')>
                                <span id="input-error" class="daw-input-error" aria-live="polite">
                                    ${kcSanitize(messagesPerField.getFirstError('username','password')!'')?no_esc}
                                </span>
                            </#if>
                        </div>

                        <div class="daw-form-options">
                            <#if (realm.rememberMe!false) && !(usernameHidden?? && usernameHidden)>
                                <div class="daw-checkbox">
                                    <label>
                                        <#if login.rememberMe??>
                                            <input tabindex="5" id="rememberMe" name="rememberMe" type="checkbox" checked> ${msg("rememberMe")}
                                        <#else>
                                            <input tabindex="5" id="rememberMe" name="rememberMe" type="checkbox"> ${msg("rememberMe")}
                                        </#if>
                                    </label>
                                </div>
                            </#if>
                            <#if (realm.resetPasswordAllowed!false) && url.loginResetCredentialsUrl??>
                                <span><a tabindex="6" href="${url.loginResetCredentialsUrl}" class="daw-link">${msg("doForgotPassword")}</a></span>
                            </#if>
                        </div>

                        <div class="daw-form-buttons">
                            <#if auth?? && auth.selectedCredential?? && auth.selectedCredential?has_content>
                                <input type="hidden" id="id-hidden-input" name="credentialId" value="${auth.selectedCredential}"/>
                            </#if>
                            <input tabindex="7" class="daw-btn daw-btn-primary" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
                        </div>
                    </form>
                </#if>
            </div>
        </div>
        <#if url.resourcesPath??>
            <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
        </#if>
    <#elseif section = "info">
        <#if (realm.password!false) && (realm.registrationAllowed!false) && url.registrationUrl??>
            <div id="kc-registration-container" class="daw-info">
                <span>${msg("noAccount")} <a tabindex="8" href="${url.registrationUrl}" class="daw-link">${msg("doRegister")}</a></span>
            </div>
        </#if>
    <#elseif section = "socialProviders">
        <#if (realm.password!false) && social?? && social.providers?? && social.providers?has_content>
            <div id="kc-social-providers" class="daw-social">
                <hr class="daw-hr"/>
                <h3 class="daw-social-title">${msg("identity-provider-login-label")}</h3>
                <ul class="daw-social-list">
                    <#list social.providers as p>
                        <li>
                            <a data-once-link data-disabled-class="daw-social-btn-disabled" id="social-${p.alias!''}"
                               class="daw-social-btn"
                               type="button" href="${p.loginUrl!''}">
                                <#if p.iconClasses?? && p.iconClasses?has_content>
                                    <i class="${properties.kcCommonLogoIdP!''} ${p.iconClasses}" aria-hidden="true"></i>
                                    <span class="daw-social-name">${p.displayName!''}</span>
                                <#else>
                                    <span class="daw-social-name">${p.displayName!''}</span>
                                </#if>
                            </a>
                        </li>
                    </#list>
                </ul>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
