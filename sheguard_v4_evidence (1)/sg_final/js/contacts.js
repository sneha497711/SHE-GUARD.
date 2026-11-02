/**
 * js/contacts.js — SHE-GUARD Module 2: Emergency Contact Management
 * Handles Multiple Contacts, Priority Sorting, Family Grouping, Helplines, and One-Click Actions.
 */

let _activeGroupFilter = 'All';
let _userContactsList = [];
let _deleteTargetId = null;

// ── 1. LOAD HELPLINES ──────────────────────────────────
async function sgLoadHelplines() {
  const container = document.getElementById('helplineServicesContainer');
  if (!container) return;

  try {
    const res = await sgApiRequest('/api/emergency-contacts/helplines', 'GET');
    if (res.success && res.helplines) {
      const police = res.helplines.police;
      const women = res.helplines.womenHelpline;
      container.innerHTML = `
        <div class="helpline-card police-card">
          <div class="helpline-icon-wrap"><i class="fas ${police.icon || 'fa-shield-halved'}"></i></div>
          <div class="helpline-info">
            <strong>${police.name}</strong>
            <span class="helpline-sub">${police.description}</span>
            <span class="helpline-num"><i class="fas fa-phone"></i> ${police.number}</span>
          </div>
          <a href="tel:${police.number}" class="btn-helpline-call" title="Call Police Emergency (${police.number})">
            <i class="fas fa-phone-volume"></i> Call
          </a>
        </div>

        <div class="helpline-card women-card">
          <div class="helpline-icon-wrap"><i class="fas ${women.icon || 'fa-person-dress'}"></i></div>
          <div class="helpline-info">
            <strong>${women.name}</strong>
            <span class="helpline-sub">${women.description}</span>
            <span class="helpline-num"><i class="fas fa-phone"></i> ${women.number}</span>
          </div>
          <a href="tel:${women.number}" class="btn-helpline-call women" title="Call Women Helpline (${women.number})">
            <i class="fas fa-phone-volume"></i> Call
          </a>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Could not fetch helplines from server, using standard defaults:', err.message);
    container.innerHTML = `
      <div class="helpline-card police-card">
        <div class="helpline-icon-wrap"><i class="fas fa-shield-halved"></i></div>
        <div class="helpline-info">
          <strong>Police Emergency</strong>
          <span class="helpline-sub">National Police Helpline</span>
          <span class="helpline-num"><i class="fas fa-phone"></i> 112</span>
        </div>
        <a href="tel:112" class="btn-helpline-call"><i class="fas fa-phone-volume"></i> Call</a>
      </div>
      <div class="helpline-card women-card">
        <div class="helpline-icon-wrap"><i class="fas fa-person-dress"></i></div>
        <div class="helpline-info">
          <strong>Women Helpline</strong>
          <span class="helpline-sub">24/7 Women in Distress</span>
          <span class="helpline-num"><i class="fas fa-phone"></i> 1091</span>
        </div>
        <a href="tel:1091" class="btn-helpline-call women"><i class="fas fa-phone-volume"></i> Call</a>
      </div>
    `;
  }
}

// ── 2. LOAD CONTACTS FROM BACKEND ──────────────────────
async function sgLoadEmergencyContacts() {
  const token = localStorage.getItem('sg_auth_token');
  if (!token) return;

  try {
    const url = `/api/emergency-contacts${_activeGroupFilter !== 'All' ? `?group=${encodeURIComponent(_activeGroupFilter)}` : ''}`;
    const res = await sgApiRequest(url, 'GET', null, true);

    if (res.success && Array.isArray(res.contacts)) {
      _userContactsList = res.contacts;

      // Sync with global contacts array for SOS
      contacts = _userContactsList.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phoneNumber,
        rel: c.relationship,
        priority: c.priority,
        group: c.contactGroup,
      }));
      localStorage.setItem('sg_contacts', JSON.stringify(contacts));

      renderContacts();
    }
  } catch (err) {
    console.warn('Load emergency contacts failed, falling back to cached:', err.message);
    renderContacts();
  }
}

// ── 3. GROUP FILTERING ─────────────────────────────────
function sgFilterContactsByGroup(group, btnEl) {
  _activeGroupFilter = group;

  // Update filter pill UI
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  sgLoadEmergencyContacts();
}

// ── 4. RENDER CONTACTS LIST ────────────────────────────
function renderContacts() {
  const listEl = document.getElementById('contactsList');
  const emptyEl = document.getElementById('contactsEmpty');
  if (!listEl) return;

  const displayList = _userContactsList || [];

  if (displayList.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.remove('hidden');
      const emptyMsg = document.getElementById('contactsEmptyMsg');
      if (emptyMsg) {
        emptyMsg.textContent = _activeGroupFilter !== 'All'
          ? `No contacts in group "${_activeGroupFilter}".`
          : 'No emergency contacts added yet. Add trusted contacts to notify during SOS.';
      }
    }
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  listEl.innerHTML = displayList.map(c => {
    const priorityColorClass = c.priority === 1 ? 'p-urgent' : (c.priority === 2 ? 'p-high' : 'p-norm');
    const groupIcon = {
      Family: 'fa-house-user',
      Friends: 'fa-user-group',
      Relatives: 'fa-people-roof',
      Colleagues: 'fa-briefcase',
      Neighbors: 'fa-street-view',
      Other: 'fa-address-book',
    }[c.contactGroup] || 'fa-user';

    return `
      <div class="contact-card priority-card">
        <div class="contact-avatar ${c.priority === 1 ? 'primary-avatar' : ''}">
          ${c.name ? c.name[0].toUpperCase() : 'C'}
        </div>

        <div class="contact-info">
          <div class="contact-header-row">
            <strong>${c.name}</strong>
            <span class="priority-badge ${priorityColorClass}" title="SOS Alert Priority">
              <i class="fas fa-flag"></i> Priority ${c.priority}
            </span>
          </div>

          <div class="contact-sub-row">
            <span class="contact-phone-text"><i class="fas fa-phone"></i> +91 ${c.phoneNumber}</span>
            <span class="contact-rel-tag">${c.relationship}</span>
            <span class="contact-group-tag"><i class="fas ${groupIcon}"></i> ${c.contactGroup}</span>
          </div>
        </div>

        <div class="contact-actions">
          <a href="tel:${c.phoneNumber}" class="action-btn call-btn" title="One-Click Call">
            <i class="fas fa-phone"></i>
          </a>
          <button class="action-btn edit-btn" onclick="sgOpenEditContactModal(${c.id})" title="Edit Contact">
            <i class="fas fa-pen"></i>
          </button>
          <button class="action-btn delete-btn" onclick="sgConfirmDeleteContact(${c.id}, '${sgEscapeHtml(c.name)}')" title="Delete Contact">
            <i class="fas fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── 5. ADD CONTACT MODAL HANDLERS ──────────────────────
function openAddContact() {
  const modal = document.getElementById('addContactModal');
  if (!modal) return;

  document.getElementById('newContactName').value = '';
  document.getElementById('newContactPhone').value = '';
  document.getElementById('newContactRel').value = 'Mother';
  document.getElementById('newContactGroup').value = 'Family';

  // Automatically suggest next priority
  const nextPriority = (_userContactsList.length || 0) + 1;
  const prioSelect = document.getElementById('newContactPriority');
  if (prioSelect) {
    prioSelect.value = String(Math.min(nextPriority, 10));
  }

  const errEl = document.getElementById('addContactError');
  if (errEl) errEl.classList.add('hidden');

  modal.classList.remove('hidden');
}

function closeAddContact() {
  const modal = document.getElementById('addContactModal');
  if (modal) modal.classList.add('hidden');
}

async function saveContact() {
  const name = document.getElementById('newContactName')?.value.trim();
  const phone = document.getElementById('newContactPhone')?.value.trim();
  const relationship = document.getElementById('newContactRel')?.value;
  const priority = document.getElementById('newContactPriority')?.value;
  const contactGroup = document.getElementById('newContactGroup')?.value;
  const errEl = document.getElementById('addContactError');

  if (errEl) errEl.classList.add('hidden');

  if (!name) {
    sgShowFormError('addContactError', 'Please enter contact name.');
    return;
  }
  const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
  if (cleanPhone.length !== 10) {
    sgShowFormError('addContactError', 'Please enter a valid 10-digit mobile number.');
    return;
  }

  try {
    const res = await sgApiRequest('/api/emergency-contacts', 'POST', {
      name,
      phoneNumber: cleanPhone,
      relationship,
      priority: parseInt(priority) || 1,
      contactGroup,
    }, true);

    if (res.success) {
      closeAddContact();
      await sgLoadEmergencyContacts();
      showToast(`${name} added as Priority ${res.contact.priority} contact ✓`);
    }
  } catch (err) {
    sgShowFormError('addContactError', err.message || 'Failed to add emergency contact.');
  }
}

// ── 6. EDIT CONTACT MODAL HANDLERS ─────────────────────
function sgOpenEditContactModal(contactId) {
  const contact = _userContactsList.find(c => c.id === contactId);
  if (!contact) return;

  document.getElementById('editContactId').value = contact.id;
  document.getElementById('editContactName').value = contact.name || '';
  document.getElementById('editContactPhone').value = contact.phoneNumber || '';
  document.getElementById('editContactRel').value = contact.relationship || 'Family';
  document.getElementById('editContactPriority').value = String(contact.priority || 1);
  document.getElementById('editContactGroup').value = contact.contactGroup || 'Family';

  const errEl = document.getElementById('editContactError');
  if (errEl) errEl.classList.add('hidden');

  document.getElementById('editContactModal')?.classList.remove('hidden');
}

function closeEditContactModal() {
  document.getElementById('editContactModal')?.classList.add('hidden');
}

async function sgSaveEditedContact() {
  const id = document.getElementById('editContactId')?.value;
  const name = document.getElementById('editContactName')?.value.trim();
  const phone = document.getElementById('editContactPhone')?.value.trim();
  const relationship = document.getElementById('editContactRel')?.value;
  const priority = document.getElementById('editContactPriority')?.value;
  const contactGroup = document.getElementById('editContactGroup')?.value;

  if (!name) {
    sgShowFormError('editContactError', 'Contact name cannot be empty.');
    return;
  }
  const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
  if (cleanPhone.length !== 10) {
    sgShowFormError('editContactError', 'Please enter a valid 10-digit mobile number.');
    return;
  }

  try {
    const res = await sgApiRequest(`/api/emergency-contacts/${id}`, 'PUT', {
      name,
      phoneNumber: cleanPhone,
      relationship,
      priority: parseInt(priority) || 1,
      contactGroup,
    }, true);

    if (res.success) {
      closeEditContactModal();
      await sgLoadEmergencyContacts();
      showToast(`Contact updated successfully ✓`);
    }
  } catch (err) {
    sgShowFormError('editContactError', err.message || 'Failed to update contact.');
  }
}

// ── 7. DELETE CONFIRMATION HANDLERS ────────────────────
function sgConfirmDeleteContact(contactId, contactName) {
  _deleteTargetId = contactId;
  const modal = document.getElementById('deleteConfirmModal');
  const targetText = document.getElementById('deleteContactTargetName');
  if (targetText) targetText.textContent = contactName || 'this contact';
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteConfirmModal() {
  _deleteTargetId = null;
  document.getElementById('deleteConfirmModal')?.classList.add('hidden');
}

async function sgExecuteDeleteContact() {
  if (!_deleteTargetId) return;

  try {
    const res = await sgApiRequest(`/api/emergency-contacts/${_deleteTargetId}`, 'DELETE', null, true);
    if (res.success) {
      closeDeleteConfirmModal();
      await sgLoadEmergencyContacts();
      showToast('Emergency contact removed.');
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete contact.', 'error');
  }
}

// ── ERROR HELPER ───────────────────────────────────────
function sgShowFormError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    el.classList.remove('hidden');
  } else {
    showToast(message, 'error');
  }
}
