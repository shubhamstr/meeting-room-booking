// Client-side interactions for Meeting Room Booking UI

document.addEventListener('DOMContentLoaded', () => {
  initCustomerSearch();
  initRoomAndSlotBooking();
  initModals();
  initSyncActions();
});

// --- 1. Customer Live Search ---
function initCustomerSearch() {
  const searchInput = document.getElementById('customer-search-input');
  const cards = document.querySelectorAll('.customer-card');
  const emptyState = document.getElementById('no-customers-found');

  if (!searchInput || !cards.length) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach((card) => {
      const name = card.getAttribute('data-name')?.toLowerCase() || '';
      const email = card.getAttribute('data-email')?.toLowerCase() || '';
      const company = card.getAttribute('data-company')?.toLowerCase() || '';

      if (name.includes(query) || email.includes(query) || company.includes(query)) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? 'flex' : 'none';
    }
  });
}

// --- 2. Interactive Room & Slot Booking ---
function initRoomAndSlotBooking() {
  const roomCards = document.querySelectorAll('.room-radio-card');
  const slotChips = document.querySelectorAll('.slot-chip.available');
  const dateInput = document.getElementById('booking-date-input');
  
  // Summary DOM elements
  const sumRoomName = document.getElementById('summary-room-name');
  const sumRoomRate = document.getElementById('summary-room-rate');
  const sumDate = document.getElementById('summary-date');
  const sumSlot = document.getElementById('summary-slot');
  const sumTotal = document.getElementById('summary-total');
  const hiddenRoomInput = document.getElementById('selected-room-id');
  const hiddenSlotInput = document.getElementById('selected-slot-id');
  const submitBtn = document.getElementById('submit-booking-btn');

  if (!roomCards.length && !slotChips.length) return;

  // Handle Room Card Click
  roomCards.forEach((card) => {
    card.addEventListener('click', () => {
      roomCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;

      const roomId = card.getAttribute('data-room-id');
      const roomName = card.getAttribute('data-room-name');
      const roomRate = card.getAttribute('data-room-rate');

      if (hiddenRoomInput) hiddenRoomInput.value = roomId;
      if (sumRoomName) sumRoomName.textContent = roomName;
      if (sumRoomRate) sumRoomRate.textContent = `$${roomRate} / hr`;
      if (sumTotal) sumTotal.textContent = `$${roomRate}`;

      // Refresh slots for newly picked room & date if on same page
      if (dateInput && dateInput.value) {
        fetchRoomSlots(roomId, dateInput.value);
      }
      checkBookingFormValidity();
    });
  });

  // Handle Date Change
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const selectedRoom = document.querySelector('.room-radio-card.selected');
      const roomId = selectedRoom ? selectedRoom.getAttribute('data-room-id') : (hiddenRoomInput ? hiddenRoomInput.value : '');
      if (sumDate) sumDate.textContent = formatDateDisplay(dateInput.value);
      if (roomId) {
        fetchRoomSlots(roomId, dateInput.value);
      }
    });
  }

  // Handle Slot Click
  function bindSlotClickEvents() {
    const availableSlots = document.querySelectorAll('.slot-chip.available');
    availableSlots.forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');

        const radio = chip.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        const slotId = chip.getAttribute('data-slot-id');
        const slotLabel = chip.getAttribute('data-slot-label');

        if (hiddenSlotInput) hiddenSlotInput.value = slotId;
        if (sumSlot) sumSlot.textContent = slotLabel;

        checkBookingFormValidity();
      });
    });
  }

  bindSlotClickEvents();

  // Helper: Fetch availability when room or date changes
  async function fetchRoomSlots(roomId, date) {
    const slotsContainer = document.getElementById('slots-grid-container');
    if (!slotsContainer) return;

    try {
      slotsContainer.style.opacity = '0.4';
      const res = await fetch(`/api/slots?roomId=${roomId}&date=${date}`);
      const data = await res.json();
      slotsContainer.style.opacity = '1';

      if (data && data.slots) {
        slotsContainer.innerHTML = '';
        data.slots.forEach(slot => {
          const isAvail = slot.isAvailable;
          const chip = document.createElement('label');
          chip.className = `slot-chip ${isAvail ? 'available' : 'booked'}`;
          chip.setAttribute('data-slot-id', slot.id);
          chip.setAttribute('data-slot-label', slot.label);
          chip.innerHTML = `
            <input type="radio" name="slotId" value="${slot.id}" ${!isAvail ? 'disabled' : ''}>
            <span class="slot-time">${slot.label}</span>
            <span class="slot-status ${isAvail ? 'available' : 'booked'}">
              ${isAvail ? '● Available' : '✕ Reserved (' + (slot.bookedBy || 'Booked') + ')'}
            </span>
          `;
          slotsContainer.appendChild(chip);
        });

        // Re-reset slot selection in summary
        if (hiddenSlotInput) hiddenSlotInput.value = '';
        if (sumSlot) sumSlot.textContent = 'Select a time slot';
        bindSlotClickEvents();
        checkBookingFormValidity();
      }
    } catch (err) {
      console.error('Error fetching slots:', err);
      slotsContainer.style.opacity = '1';
    }
  }

  function checkBookingFormValidity() {
    const hasRoom = hiddenRoomInput && hiddenRoomInput.value;
    const hasSlot = hiddenSlotInput && hiddenSlotInput.value;
    if (submitBtn) {
      if (hasRoom && hasSlot) {
        submitBtn.removeAttribute('disabled');
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
      } else {
        submitBtn.setAttribute('disabled', 'true');
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
      }
    }
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Select date';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  }
}

// --- 3. Modals ---
function initModals() {
  const openModalBtns = document.querySelectorAll('[data-open-modal]');
  const closeModalBtns = document.querySelectorAll('[data-close-modal]');
  const overlays = document.querySelectorAll('.modal-overlay');

  openModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-open-modal');
      const targetModal = document.getElementById(targetId);
      if (targetModal) targetModal.classList.add('active');
    });
  });

  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      overlays.forEach(m => m.classList.remove('active'));
    });
  });

  overlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
}

// --- 4. Interactive AJAX Sync Actions (POST APIs) ---
function initSyncActions() {
  const syncForms = document.querySelectorAll('form[action="/api/zoho/sync"], form[action="/api/calendar/sync"]');

  syncForms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (!btn) return;

      const isZoho = form.action.includes('/api/zoho/sync');
      const originalHtml = btn.innerHTML;
      const originalDisabled = btn.disabled;

      try {
        btn.disabled = true;
        btn.innerHTML = `
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <span>${isZoho ? 'Syncing Zoho CRM...' : 'Syncing Calendar...'}</span>
        `;
        btn.style.opacity = '0.75';
        btn.style.pointerEvents = 'none';

        const response = await fetch(form.action, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showNotification(data.message || 'Sync completed successfully!', 'success');
          // Reload page after a brief delay to show synced records/status updates
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        } else {
          showNotification(data.error || 'Sync request failed. Please check connection.', 'error');
          btn.disabled = originalDisabled;
          btn.innerHTML = originalHtml;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        }
      } catch (err) {
        showNotification(`Sync failed: ${err.message}`, 'error');
        btn.disabled = originalDisabled;
        btn.innerHTML = originalHtml;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
    });
  });
}

// Toast notification helper
function showNotification(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '24px';
    container.style.right = '24px';
    container.style.zIndex = '99999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const isSuccess = type === 'success';
  toast.style.background = isSuccess ? 'linear-gradient(135deg, #065f46, #047857)' : 'linear-gradient(135deg, #881337, #b91c1c)';
  toast.style.color = '#ffffff';
  toast.style.padding = '14px 20px';
  toast.style.borderRadius = '12px';
  toast.style.boxShadow = '0 12px 30px rgba(0,0,0,0.4)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '12px';
  toast.style.fontSize = '0.95rem';
  toast.style.fontWeight = '600';
  toast.style.border = isSuccess ? '1px solid #10b981' : '1px solid #ef4444';
  toast.style.transition = 'all 0.3s ease';
  toast.style.transform = 'translateY(-10px)';
  toast.style.opacity = '0';

  toast.innerHTML = `
    <i class="fa-solid ${isSuccess ? 'fa-circle-check' : 'fa-triangle-exclamation'}" style="font-size: 1.2rem;"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

