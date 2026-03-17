// lib/i18n.js

const translations = {
    es: {
        // Common
        "app_name": "Open2FA",
        "settings": "Configuración",
        "cancel": "Cancelar",
        "save": "Guardar",
        "remove": "Eliminar",
        "search_placeholder": "Buscar cuentas...",
        "no_accounts": "No hay cuentas aún.",
        "add_account": "Agregar Cuenta",
        "copied": "¡Copiado!",
        "error": "Error",
        
        // Options page
        "dashboard_title": "Panel de Open2FA",
        "add_account_btn": "+ Agregar Cuenta",
        "no_accounts_msg": "Agregue una cuenta 2FA para comenzar a autocompletar sus códigos de forma segura.",
        "first_account_btn": "Agregar mi primera cuenta",
        "modal_title": "Agregar Cuenta 2FA",
        "domain_label": "Dominio asociado",
        "domain_placeholder": "ej. csnegrete.com",
        "domain_hint": "La extensión mostrará códigos para este dominio.",
        "username_label": "Usuario / Email",
        "username_placeholder": "ej. hola@empresa.com",
        "secret_label": "Secreto 2FA (Base32)",
        "secret_placeholder": "ej. JBSWY3DPEHPK3PXP",
        "delete_confirm": "¿Estás seguro de que quieres eliminar esta cuenta 2FA?",
        "language_label": "Idioma / Language",

        // Advanced features
        "scan_qr": "Escanear QR de la página",
        "upload_qr": "Subir imagen QR",
        "add_domains": "Dominios (separados por coma)",
        "domains_label": "Dominios asociados",
        "edit": "Editar",
        "qr_not_found": "No se encontró ningún código QR.",
        "qr_success": "¡Cuenta añadida con éxito!",
        "invalid_qr": "El código QR no es un secreto 2FA válido.",
        "invalid_link": "El enlace no es válido.",
        "delete": "Eliminar",
        "manage_accounts": "Gestionar Cuentas",
        "back": "Volver",
        "manual_mode": "Manual",
        "link_mode": "Enlace",
        "bulk_add": "Añadir Masivo",
        "bulk_placeholder": "Pega aquí tus enlaces otpauth:// (uno por línea)",

        // Autofill
        "select_autofill": "Seleccionar para autocompletar el código 2FA",
        "delete_success": "Eliminado"
    },
    en: {
        // Common
        "app_name": "Open2FA",
        "settings": "Settings",
        "cancel": "Cancel",
        "save": "Save",
        "remove": "Remove",
        "search_placeholder": "Search accounts...",
        "no_accounts": "No accounts yet.",
        "add_account": "Add Account",
        "copied": "Copied!",
        "error": "Error",
        
        // Options page
        "dashboard_title": "Open2FA Dashboard",
        "add_account_btn": "+ Add Account",
        "no_accounts_msg": "Add a 2FA account to start securely autofilling your codes.",
        "first_account_btn": "Add your first account",
        "modal_title": "Add 2FA Account",
        "domain_label": "Domains (comma separated)",
        "domain_placeholder": "e.g. google.com, github.com",
        "domain_hint": "The extension will show codes for these domains.",
        "username_label": "Username / Email",
        "username_placeholder": "e.g. user@example.com",
        "secret_label": "2FA Secret (Base32)",
        "secret_placeholder": "e.g. JBSWY3DPEHPK3PXP",
        "delete_confirm": "Are you sure you want to remove this 2FA account?",
        "language_label": "Language / Idioma",

        // Advanced features
        "scan_qr": "Scan QR from Page",
        "upload_qr": "Upload QR Image",
        "add_domains": "Domains (comma separated)",
        "domains_label": "Associated Domains",
        "edit": "Edit",
        "qr_not_found": "No QR code found.",
        "qr_success": "Account added successfully!",
        "invalid_qr": "QR code is not a valid 2FA secret.",
        "invalid_link": "Link is not valid.",
        "delete": "Delete",
        "manage_accounts": "Manage Accounts",
        "back": "Back",
        "manual_mode": "Manual",
        "link_mode": "Link",
        "bulk_add": "Bulk Add",
        "bulk_placeholder": "Paste your otpauth:// links here (one per line)",

        // Autofill
        "select_autofill": "Select to autofill 2FA code",
        "delete_success": "Deleted"
    }
};

let currentLang = 'es'; // Default to Spanish as requested

/**
 * Initializes language from storage
 */
async function initI18n() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['language'], (result) => {
            if (result.language && translations[result.language]) {
                currentLang = result.language;
            }
            resolve(currentLang);
        });
    });
}

/**
 * Gets a translated string
 * @param {string} key 
 * @returns {string}
 */
function t(key) {
    if (translations[currentLang] && translations[currentLang][key]) {
        return translations[currentLang][key];
    }
    // Fallback to English, then the key itself
    if (translations['en'][key]) return translations['en'][key];
    return key;
}

/**
 * Translates the entire page by searching for data-i18n attributes
 */
function translatePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || el.type === 'placeholder')) {
            el.placeholder = translation;
        } else if (el.tagName === 'TEXTAREA') {
            el.placeholder = translation;
        } else {
            el.innerText = translation;
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });
}

/**
 * Sets current language and saves it
 * @param {string} lang 
 */
function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        chrome.storage.local.set({ language: lang }, () => {
            translatePage();
        });
    }
}
