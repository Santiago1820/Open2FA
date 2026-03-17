document.addEventListener('DOMContentLoaded', async () => {
    // Initialize translations
    await initI18n();
    translatePage();

    const listEl = document.getElementById('accounts-list');
    const searchInput = document.getElementById('search');
    const emptyState = document.getElementById('empty-state');
    const settingsBtn = document.getElementById('settings-btn');
    
    // New buttons
    const scanBtn = document.getElementById('scan-qr-btn');
    const addManualBtn = document.getElementById('add-manual-btn');
    const addModal = document.getElementById('add-modal');
    const closeAddModal = document.getElementById('close-add-modal');
    const popupAddForm = document.getElementById('popup-add-form');

    // Confirm modal
    const confirmModal = document.getElementById('confirm-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    let idToDelete = null;

    // Mode switch elements
    const modeManual = document.getElementById('mode-manual');
    const modeLink = document.getElementById('mode-link');
    const manualFields = document.getElementById('manual-fields');
    const linkFields = document.getElementById('link-fields');
    let currentMode = 'manual';

    let accounts = [];
    let intervalId = null;
    let editingId = null;

    chrome.storage.local.get(['accounts'], (result) => {
        accounts = result.accounts || [];
        renderList(accounts);
        startUpdateLoop();
    });

    // --- Add Mode Switching ---
    modeManual.addEventListener('click', () => {
        currentMode = 'manual';
        modeManual.classList.add('active');
        modeLink.classList.remove('active');
        manualFields.classList.remove('hidden');
        linkFields.classList.add('hidden');
    });

    modeLink.addEventListener('click', () => {
        currentMode = 'link';
        modeLink.classList.add('active');
        modeManual.classList.remove('active');
        linkFields.classList.remove('hidden');
        manualFields.classList.add('hidden');
    });

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.innerText = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // --- Search ---
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = accounts.filter(acc => 
            acc.domain.toLowerCase().includes(query) || 
            acc.username.toLowerCase().includes(query)
        );
        renderList(filtered);
    });

    function renderList(items) {
        listEl.innerHTML = '';
        if (items.length === 0) {
            listEl.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        listEl.classList.remove('hidden');
        emptyState.classList.add('hidden');

        items.forEach(acc => {
            const item = document.createElement('div');
            item.className = 'account-item';
            
            item.innerHTML = `
                <div class="acc-actions">
                    <div class="acc-edit-btn" data-id="${acc.id}" title="${t('edit')}">✎</div>
                    <div class="acc-delete-btn" data-id="${acc.id}" title="${t('remove')}">&times;</div>
                </div>
                <div class="account-info">
                    <div class="account-domain">${escapeHTML(acc.domain)}</div>
                    <div class="account-user">${escapeHTML(acc.username)}</div>
                </div>
                <div class="account-code" id="pcode-${acc.id}">--- ---</div>
            `;
            
            // Delete logic
            item.querySelector('.acc-delete-btn').onclick = (e) => {
                e.stopPropagation();
                idToDelete = acc.id;
                confirmModal.classList.remove('hidden');
            };

            // Edit logic
            item.querySelector('.acc-edit-btn').onclick = (e) => {
                e.stopPropagation();
                openEditModal(acc.id);
            };

            item.addEventListener('click', () => {
                const codeSpan = document.getElementById(`pcode-${acc.id}`);
                const codeRaw = codeSpan.dataset.raw;
                if (codeRaw) {
                    navigator.clipboard.writeText(codeRaw).then(() => {
                        const original = codeSpan.innerText;
                        codeSpan.innerText = t('copied');
                        setTimeout(() => codeSpan.innerText = original, 1000);
                    });
                }
            });

            listEl.appendChild(item);
        });
        updateCodes();
    }

    // --- Confirm Logic ---
    cancelDeleteBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        idToDelete = null;
    });

    confirmDeleteBtn.addEventListener('click', () => {
        if (idToDelete) {
            accounts = accounts.filter(a => a.id !== idToDelete);
            chrome.storage.local.set({ accounts }, () => {
                renderList(accounts);
                confirmModal.classList.add('hidden');
                idToDelete = null;
                showToast(t('delete_success'));
            });
        }
    });

    function openEditModal(id) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;
        editingId = id;
        document.querySelector('#add-modal h2').innerText = t('edit');
        
        // Always show manual fields for edit
        currentMode = 'manual';
        modeManual.classList.add('active');
        modeLink.classList.remove('active');
        manualFields.classList.remove('hidden');
        linkFields.classList.add('hidden');
        // Hide switcher during edit? 
        document.querySelector('.mode-switcher').classList.add('hidden');

        document.getElementById('p-domain').value = acc.domain;
        document.getElementById('p-username').value = acc.username;
        document.getElementById('p-secret').value = acc.secret;
        
        addModal.classList.remove('hidden');
    }

    function hideAddModal() {
        addModal.classList.add('hidden');
        editingId = null;
        document.querySelector('.mode-switcher').classList.remove('hidden');
        popupAddForm.reset();
    }

    // --- Capture Tab ---
    scanBtn.addEventListener('click', async () => {
        try {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    showToast(t('error'));
                    return;
                }
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);
                    
                    if (code) {
                        parseAndAddOTP(code.data);
                    } else {
                        showToast(t('qr_not_found'));
                    }
                };
                img.src = dataUrl;
            });
        } catch (err) {
            console.error(err);
        }
    });

    function parseAndAddOTP(uri) {
        try {
            const url = new URL(uri);
            if (url.protocol !== 'otpauth:') throw new Error();
            
            const params = url.searchParams;
            const secret = params.get('secret');
            const issuer = params.get('issuer') || url.pathname.split(':')[0].replace('//totp/', '');
            const label = decodeURIComponent(url.pathname.split(':').pop());

            if (!secret) return showToast(t('qr_invalid'));

            const newAcc = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                domain: issuer.toLowerCase() + '.com',
                username: label,
                secret: secret.toUpperCase()
            };

            accounts.push(newAcc);
            chrome.storage.local.set({ accounts }, () => {
                showToast(t('qr_success'));
                renderList(accounts);
            });
        } catch (e) {
            showToast(t('qr_invalid'));
        }
    }

    // --- Manual Add Modal ---
    addManualBtn.addEventListener('click', () => {
        editingId = null;
        document.querySelector('#add-modal h2').innerText = t('modal_title');
        popupAddForm.reset();
        addModal.classList.remove('hidden');
    });
    closeAddModal.addEventListener('click', hideAddModal);
    
    popupAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (currentMode === 'manual') {
            const domains = document.getElementById('p-domain').value.trim();
            const user = document.getElementById('p-username').value.trim();
            const secret = document.getElementById('p-secret').value.trim().toUpperCase().replace(/\s+/g, '');

            if (!domains || !user || !secret) return;

            if (editingId) {
                const index = accounts.findIndex(a => a.id === editingId);
                if (index !== -1) {
                    accounts[index] = { ...accounts[index], domain: domains, username: user, secret };
                }
            } else {
                const newAcc = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    domain: domains,
                    username: user,
                    secret: secret
                };
                accounts.push(newAcc);
            }
        } else {
            const link = document.getElementById('p-link').value.trim();
            try {
                const url = new URL(link);
                if (url.protocol !== 'otpauth:') throw new Error();
                const params = url.searchParams;
                const secret = params.get('secret');
                const issuer = params.get('issuer') || url.pathname.split(':')[0].replace('//totp/', '');
                const label = decodeURIComponent(url.pathname.split(':').pop());

                if (!secret) return showToast(t('invalid_link'));

                const newAcc = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    domain: issuer.toLowerCase() + '.com',
                    username: label,
                    secret: secret.toUpperCase()
                };
                accounts.push(newAcc);
            } catch(err) {
                showToast(t('invalid_link'));
                return;
            }
        }

        chrome.storage.local.set({ accounts }, () => {
            hideAddModal();
            renderList(accounts);
        });
    });

    async function updateCodes() {
        const elements = document.querySelectorAll('[id^=pcode-]');
        for (const el of elements) {
            const id = el.id.replace('pcode-', '');
            const acc = accounts.find(a => a.id === id);
            if (acc && el.innerText !== t('copied')) {
                try {
                    const code = await generateTOTP(acc.secret);
                    el.innerText = code.slice(0,3) + ' ' + code.slice(3);
                    el.dataset.raw = code;
                } catch(e) {
                    el.innerText = t('error');
                }
            }
        }
    }

    function startUpdateLoop() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(updateCodes, 1000);
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

    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});
