document.addEventListener('DOMContentLoaded', async () => {
    // Initialize translations
    await initI18n();
    translatePage();

    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.value = currentLang;
        langSelect.addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });
    }

    const addBtn = document.getElementById('add-btn');
    const addBtnEmpty = document.getElementById('add-btn-empty');
    const modalOverlay = document.getElementById('modal-overlay');
    const closeModal = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const addForm = document.getElementById('add-form');
    
    // Bulk elements
    const bulkBtn = document.getElementById('bulk-add-btn');
    const bulkModal = document.getElementById('bulk-modal');
    const closeBulkModal = document.getElementById('close-bulk-modal');
    const cancelBulkBtn = document.getElementById('cancel-bulk');
    const saveBulkBtn = document.getElementById('save-bulk');
    const bulkTextarea = document.getElementById('bulk-urls');

    // QR elements
    const uploadQrBtn = document.getElementById('upload-qr-btn');
    const qrInput = document.getElementById('qr-input');

    const accountsList = document.getElementById('accounts-list');
    const emptyState = document.getElementById('empty-state');
    
    let accounts = [];
    let intervalId = null;
    let editingId = null; // Track if we are editing an account

    // Load accounts
    function loadAccounts() {
        chrome.storage.local.get(['accounts'], (result) => {
            accounts = result.accounts || [];
            renderAccounts();
            startUpdateLoop();
        });
    }

    function renderAccounts() {
        if (accounts.length === 0) {
            accountsList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        accountsList.classList.remove('hidden');
        emptyState.classList.add('hidden');
        accountsList.innerHTML = '';

        accounts.forEach(acc => {
            const card = document.createElement('div');
            card.className = 'card';
            
            card.innerHTML = `
                <div class="card-header">
                    <div style="flex: 1; overflow: hidden;">
                        <div class="card-title">${escapeHTML(acc.domain)}</div>
                        <div class="card-subtitle">${escapeHTML(acc.username)}</div>
                    </div>
                    <div class="card-actions" style="display: flex; gap: 8px;">
                        <button class="edit-btn secondary-btn" data-id="${acc.id}" style="padding: 4px 8px; font-size: 12px;" data-i18n="edit">${t('edit')}</button>
                        <button class="delete-btn secondary-btn" data-id="${acc.id}" style="padding: 4px 8px; font-size: 12px; border-color: var(--danger-color); color: var(--danger-color);" data-i18n="remove">${t('remove')}</button>
                    </div>
                </div>
                <div class="card-code" id="code-${acc.id}">------</div>
            `;
            accountsList.appendChild(card);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                deleteAccount(id);
            });
        });

        // Add edit listeners
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                openEditModal(id);
            });
        });
    }

    // Confirm modal elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    let idToDelete = null;

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.innerText = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // Modal logic
    function openModal() {
        editingId = null;
        document.querySelector('#modal-overlay h2').innerText = t('modal_title');
        addForm.reset();
        modalOverlay.classList.remove('hidden');
        document.getElementById('domain').focus();
    }

    function openEditModal(id) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;
        
        editingId = id;
        document.querySelector('#modal-overlay h2').innerText = t('edit');
        
        document.getElementById('domain').value = acc.domain;
        document.getElementById('username').value = acc.username;
        document.getElementById('secret').value = acc.secret;
        
        modalOverlay.classList.remove('hidden');
        document.getElementById('domain').focus();
    }

    function hideModal() {
        modalOverlay.classList.add('hidden');
        editingId = null;
    }

    // Confirm Logic
    cancelDeleteBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        idToDelete = null;
    });

    confirmDeleteBtn.addEventListener('click', () => {
        if (idToDelete) {
            accounts = accounts.filter(a => a.id !== idToDelete);
            chrome.storage.local.set({ accounts }, () => {
                renderAccounts();
                confirmModal.classList.add('hidden');
                idToDelete = null;
                showToast(t('delete_success'));
            });
        }
    });

    function deleteAccount(id) {
        idToDelete = id;
        confirmModal.classList.remove('hidden');
    }

    addBtn.addEventListener('click', openModal);
    if (addBtnEmpty) addBtnEmpty.addEventListener('click', openModal);
    closeModal.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);

    // Bulk Modal logic
    bulkBtn.addEventListener('click', () => {
        bulkTextarea.value = '';
        bulkModal.classList.remove('hidden');
    });
    const hideBulk = () => bulkModal.classList.add('hidden');
    closeBulkModal.addEventListener('click', hideBulk);
    cancelBulkBtn.addEventListener('click', hideBulk);

    saveBulkBtn.addEventListener('click', () => {
        const content = bulkTextarea.value.trim();
        if (!content) return hideBulk();
        
        const lines = content.split('\n');
        let addedCount = 0;

        lines.forEach(line => {
            const uri = line.trim();
            if (!uri) return;
            try {
                const acc = parseOTPURI(uri);
                if (acc) {
                    accounts.push(acc);
                    addedCount++;
                }
            } catch(e) { console.error("Invalid bulk line:", uri); }
        });

        if (addedCount > 0) {
            chrome.storage.local.set({ accounts }, () => {
                renderAccounts();
                hideBulk();
                showToast(t('save'));
            });
        } else {
            showToast(t('invalid_link'));
        }
    });

    // QR Logic
    uploadQrBtn.addEventListener('click', () => qrInput.click());
    qrInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
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
                    const acc = parseOTPURI(code.data);
                    if (acc) {
                        accounts.push(acc);
                        chrome.storage.local.set({ accounts }, () => {
                            renderAccounts();
                            showToast(t('qr_success'));
                        });
                    } else { showToast(t('qr_invalid')); }
                } else { showToast(t('qr_not_found')); }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    function parseOTPURI(uri) {
        try {
            const url = new URL(uri);
            if (url.protocol !== 'otpauth:') return null;
            const params = url.searchParams;
            const secret = params.get('secret');
            const issuer = params.get('issuer') || url.pathname.split(':')[0].replace('//totp/', '');
            const label = decodeURIComponent(url.pathname.split(':').pop());
            if (!secret) return null;
            return {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                domain: issuer.toLowerCase() + '.com',
                username: label,
                secret: secret.toUpperCase()
            };
        } catch(e) { return null; }
    }

    // Save logic
    addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const domain = document.getElementById('domain').value.trim();
        const username = document.getElementById('username').value.trim();
        const secret = document.getElementById('secret').value.trim().toUpperCase().replace(/\s+/g, '');

        if (!domain || !username || !secret) return;

        if (editingId) {
            // Update existing
            const index = accounts.findIndex(a => a.id === editingId);
            if (index !== -1) {
                accounts[index] = { ...accounts[index], domain, username, secret };
            }
        } else {
            // Add new
            const newAccount = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                domain,
                username,
                secret
            };
            accounts.push(newAccount);
        }

        chrome.storage.local.set({ accounts }, () => {
            hideModal();
            renderAccounts();
            updateCodes();
        });
    });

    // Update Codes Loop
    async function updateCodes() {
        for (const acc of accounts) {
            const codeElement = document.getElementById(`code-${acc.id}`);
            if (codeElement) {
                try {
                    const code = await generateTOTP(acc.secret);
                    codeElement.innerText = code.slice(0,3) + ' ' + code.slice(3);
                } catch (err) {
                    console.error("Error generating TOTP for", acc.domain, err);
                    codeElement.innerText = "Error";
                }
            }
        }
    }

    function startUpdateLoop() {
        if (intervalId) clearInterval(intervalId);
        updateCodes();
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

    // Initialize
    loadAccounts();
});
