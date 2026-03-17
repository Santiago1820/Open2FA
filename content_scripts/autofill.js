// content_scripts/autofill.js

let accountsForDomain = [];
let dropdownEl = null;
let activeInput = null;

// Initialize
async function start() {
    await initI18n();
    refreshAccounts();

    // Listen for storage changes to update list without reload
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.accounts) {
            refreshAccounts();
        }
    });
}

function refreshAccounts() {
    chrome.storage.local.get(['accounts'], (result) => {
        const allAccounts = result.accounts || [];
        const currentDomain = window.location.hostname.replace(/^www\./, '');
        
        // Filter accounts by domain (handles comma separated lists)
        accountsForDomain = allAccounts.filter(acc => {
            const domainList = acc.domain.split(',').map(d => d.trim().toLowerCase());
            return domainList.some(d => {
                if (!d) return false;
                // Strict-ish checking: either exact, or subdomain match
                return currentDomain === d || currentDomain.endsWith('.' + d) || d === currentDomain.split('.').slice(-2).join('.');
            });
        });

        // Re-initialize or update dropdown
        if (dropdownEl) {
            dropdownEl.remove();
            dropdownEl = null;
        }

        if (accountsForDomain.length > 0) {
            initAutofill();
        }
    });
}

start();

function initAutofill() {
    createDropdown();
    
    // Listen to focus on any input field dynamically
    // Remove old listener if any to avoid duplicates
    document.removeEventListener('focusin', handleFocus);
    document.addEventListener('focusin', handleFocus);
}

function handleFocus(e) {
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    
    if (is2FAField(el)) {
        activeInput = el;
        showDropdown(el);
    }
}

// Heuristic to detect 2FA/TOTP fields
function is2FAField(el) {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'checkbox' || el.type === 'radio') {
        return false;
    }
    
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const className = (el.className || '').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    
    if (autocomplete === 'one-time-code' || autocomplete === '2fa-code') return true;
    
    const keywords = ['2fa', 'totp', 'mfa', 'code', 'otp', 'authenticator', 'token', 'auth'];
    const textToSearch = `${name} ${id} ${className} ${placeholder}`;
    
    for (let word of keywords) {
        if (textToSearch.includes(word)) return true;
    }
    
    // Check if there is a label with keywords
    if (el.labels) {
        for (let label of el.labels) {
            const labelText = label.innerText.toLowerCase();
            for (let word of keywords) {
                if (labelText.includes(word)) return true;
            }
        }
    }

    return false;
}

function createDropdown() {
    dropdownEl = document.createElement('div');
    dropdownEl.id = 'open2fa-dropdown';
    dropdownEl.style.display = 'none';

    accountsForDomain.forEach(acc => {
        const option = document.createElement('div');
        option.className = 'open2fa-option';
        option.title = t('select_autofill');
        
        option.innerHTML = `
            <div class="open2fa-icon">🛡️</div>
            <div class="open2fa-details">
                <div class="open2fa-domain">${escapeHTML(acc.domain)}</div>
                <div class="open2fa-user">${escapeHTML(acc.username)}</div>
            </div>
            <div class="open2fa-action">➜</div>
        `;
        
        // Prevent focus loss when clicking dropdown
        option.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (activeInput) {
                try {
                    const code = await generateTOTP(acc.secret);
                    activeInput.value = code;
                    
                    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
                } catch(err) {
                    console.error('Open2FA generation error:', err);
                }
                hideDropdown();
            }
        });
        
        dropdownEl.appendChild(option);
    });

    document.body.appendChild(dropdownEl);
}

function showDropdown(inputEl) {
    if (!dropdownEl) return;
    
    const rect = inputEl.getBoundingClientRect();
    
    dropdownEl.style.display = 'flex';
    
    // Check overflow bottom
    const dropdownHeight = accountsForDomain.length * 50; 
    let top = rect.bottom + window.scrollY + 5;
    if (rect.bottom + dropdownHeight > window.innerHeight) {
        top = rect.top + window.scrollY - 5 - Math.min(dropdownHeight, 250);
    }
    
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.left = `${rect.left + window.scrollX}px`;
    dropdownEl.style.width = `${Math.max(rect.width, 250)}px`;
    
    // Close when clicking outside
    const closeListener = (e) => {
        if (!dropdownEl.contains(e.target) && e.target !== inputEl) {
            hideDropdown();
            document.removeEventListener('mousedown', closeListener);
        }
    };
    document.addEventListener('mousedown', closeListener);
}

function hideDropdown() {
    if (dropdownEl) dropdownEl.style.display = 'none';
}

function trySubmitForm(inputEl) {
    if (inputEl.form) {
        // Find submit button and click it to trigger proper submit handlers
        const submitBtn = inputEl.form.querySelector('input[type="submit"], button[type="submit"]');
        if (submitBtn) {
            submitBtn.click();
        } else {
            // fallback
            inputEl.form.requestSubmit();
        }
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}
