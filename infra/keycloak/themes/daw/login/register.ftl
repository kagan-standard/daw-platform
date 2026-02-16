<#import "template.ftl" as layout>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<@layout.registrationLayout displayMessage=(messagesPerField?? && messagesPerField.exists('global')) displayRequiredFields=true; section>
    <#if section = "header">
        <h2 class="daw-form-title">
            <#if messageHeader?? && messageHeader?has_content>
                ${kcSanitize(msg(messageHeader))?no_esc}
            <#else>
                ${msg("registerTitle")}
            </#if>
        </h2>
    <#elseif section = "form">
        <form id="kc-register-form" class="daw-form" action="${url.registrationAction}" method="post">

            <#if userProfileCommons??>
                <@userProfileCommons.userProfileFormFields; callback, attribute>
                    <#if callback = "afterField">
                        <#if passwordRequired?? && passwordRequired && attribute?? && (attribute.name == 'username' || (attribute.name == 'email' && (realm.registrationEmailAsUsername!false)))>
                            <div class="daw-form-group">
                                <label for="password" class="daw-label">${msg("password")} <span class="daw-required">*</span></label>
                                <div class="daw-input-group" dir="ltr">
                                    <input type="password" id="password" class="daw-input" name="password"
                                           autocomplete="new-password"
                                           aria-invalid="<#if messagesPerField?? && messagesPerField.existsError('password','password-confirm')>true</#if>" />
                                    <button class="daw-password-toggle" type="button" aria-label="${msg('showPassword')}"
                                            aria-controls="password" data-password-toggle
                                            data-icon-show="${properties.kcFormPasswordVisibilityIconShow!''}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!''}"
                                            data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                        <i class="${properties.kcFormPasswordVisibilityIconShow!''}" aria-hidden="true"></i>
                                    </button>
                                </div>
                                <#if messagesPerField?? && messagesPerField.existsError('password')>
                                    <span id="input-error-password" class="daw-input-error" aria-live="polite">
                                        ${kcSanitize(messagesPerField.get('password')!'')?no_esc}
                                    </span>
                                </#if>
                            </div>

                            <div class="daw-form-group">
                                <label for="password-confirm" class="daw-label">${msg("passwordConfirm")} <span class="daw-required">*</span></label>
                                <div class="daw-input-group" dir="ltr">
                                    <input type="password" id="password-confirm" class="daw-input" name="password-confirm"
                                           autocomplete="new-password"
                                           aria-invalid="<#if messagesPerField?? && messagesPerField.existsError('password-confirm')>true</#if>" />
                                    <button class="daw-password-toggle" type="button" aria-label="${msg('showPassword')}"
                                            aria-controls="password-confirm" data-password-toggle
                                            data-icon-show="${properties.kcFormPasswordVisibilityIconShow!''}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!''}"
                                            data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                        <i class="${properties.kcFormPasswordVisibilityIconShow!''}" aria-hidden="true"></i>
                                    </button>
                                </div>
                                <#if messagesPerField?? && messagesPerField.existsError('password-confirm')>
                                    <span id="input-error-password-confirm" class="daw-input-error" aria-live="polite">
                                        ${kcSanitize(messagesPerField.get('password-confirm')!'')?no_esc}
                                    </span>
                                </#if>
                            </div>
                        </#if>
                    </#if>
                </@userProfileCommons.userProfileFormFields>
            </#if>

            <#if registerCommons??>
                <@registerCommons.termsAcceptance/>
            </#if>

            <#if recaptchaRequired?? && recaptchaRequired && (recaptchaVisible!false) && recaptchaSiteKey?? && recaptchaAction??>
                <div class="daw-form-group">
                    <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}" data-action="${recaptchaAction}"></div>
                </div>
            </#if>

            <div class="daw-form-options">
                <#if url.loginUrl??>
                    <span><a href="${url.loginUrl}" class="daw-link">${msg("backToLogin")}</a></span>
                </#if>
            </div>

            <#if recaptchaRequired?? && recaptchaRequired && !(recaptchaVisible!false) && recaptchaSiteKey?? && recaptchaAction??>
                <script>
                    function onSubmitRecaptcha(token) {
                        var form = document.getElementById("kc-register-form");
                        if (form) form.requestSubmit();
                    }
                </script>
                <div class="daw-form-buttons">
                    <button class="daw-btn daw-btn-primary g-recaptcha"
                            data-sitekey="${recaptchaSiteKey}" data-callback='onSubmitRecaptcha' data-action='${recaptchaAction}' type="submit">
                        ${msg("doRegister")}
                    </button>
                </div>
            <#else>
                <div class="daw-form-buttons">
                    <input class="daw-btn daw-btn-primary" type="submit" value="${msg("doRegister")}"/>
                </div>
            </#if>
        </form>
        <#if url.resourcesPath??>
            <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
        </#if>
    </#if>
</@layout.registrationLayout>
