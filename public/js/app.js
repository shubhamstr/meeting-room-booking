document.addEventListener('DOMContentLoaded', () => {
  initCustomerTableApi();
  initRoomsDirectory();
  initRoomAvailability();
  initBookingsApiView();
  initModals();
  initSyncActions();
});

// --- Toast / Notification Helper ---
function showNotification(message, type = 'info') {
  const existingToast = document.querySelector('.custom-toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `custom-toast-notification toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info')}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- 1. Customer Live API Table Controller (GET /api/customers) ---
function initCustomerTableApi() {
  const tableBody = document.getElementById('customers-table-body');
  if (!tableBody) return; // Not on customers directory view

  const searchInput = document.getElementById('customer-search-input');
  const searchClearBtn = document.getElementById('customer-search-clear');
  const limitSelect = document.getElementById('customer-limit-select');
  const refreshBtn = document.getElementById('api-refresh-btn');
  const refreshIcon = document.getElementById('api-refresh-icon');
  const countBadge = document.getElementById('total-customers-badge');
  const paginationFooter = document.getElementById('customers-pagination-footer');
  const loadingContainer = document.getElementById('customers-loading-state');
  const emptyContainer = document.getElementById('customers-empty-state');
  const errorContainer = document.getElementById('customers-error-state');
  const tableCard = document.getElementById('customers-table-card');

  // Parse initial query params from URL
  const urlParams = new URLSearchParams(window.location.search);
  let state = {
    search: urlParams.get('search') || (searchInput ? searchInput.value : ''),
    page: parseInt(urlParams.get('page'), 10) || 1,
    limit: parseInt(urlParams.get('limit'), 10) || (limitSelect ? parseInt(limitSelect.value, 10) : 10),
    total: 0,
    totalPages: 1,
    loading: false
  };

  if (searchInput && state.search) {
    searchInput.value = state.search;
    if (searchClearBtn) searchClearBtn.style.display = 'inline-flex';
  }
  if (limitSelect && state.limit) {
    limitSelect.value = String(state.limit);
  }

  // Fetch function using GET /api/customers
  async function fetchCustomers(updateUrl = true) {
    state.loading = true;
    showLoading(true);

    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    try {
      const params = new URLSearchParams({
        search: state.search.trim(),
        page: state.page,
        limit: state.limit
      });

      const endpoint = `/api/customers?${params.toString()}`;
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch customers data.');
      }

      const customersList = json.data || json.customers || [];
      state.total = json.total !== undefined ? json.total : (json.count || customersList.length);
      state.totalPages = json.totalPages || Math.max(1, Math.ceil(state.total / state.limit));
      state.page = json.page || state.page;

      if (updateUrl) {
        const newUrl = new URL(window.location);
        if (state.search.trim()) newUrl.searchParams.set('search', state.search.trim());
        else newUrl.searchParams.delete('search');
        if (state.page > 1) newUrl.searchParams.set('page', state.page);
        else newUrl.searchParams.delete('page');
        if (state.limit !== 10) newUrl.searchParams.set('limit', state.limit);
        else newUrl.searchParams.delete('limit');
        window.history.replaceState({}, '', newUrl.toString());
      }

      renderTable(customersList);
      renderPagination(json);
      updateBadge();
      showError(null);
    } catch (err) {
      console.error('Error fetching /api/customers:', err);
      showError(err.message);
    } finally {
      state.loading = false;
      showLoading(false);
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
  }

  function getInitials(name) {
    if (!name) return 'CU';
    return name
      .split(' ')
      .filter(Boolean)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CU';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTable(customers) {
    if (!customers || customers.length === 0) {
      if (tableCard) tableCard.style.display = 'none';
      if (emptyContainer) {
        emptyContainer.style.display = 'block';
        const emptyQueryElem = emptyContainer.querySelector('.empty-query-text');
        const emptyQueryWrap = emptyContainer.querySelector('.empty-query-wrap');
        const emptyDefaultWrap = emptyContainer.querySelector('.empty-default-wrap');
        if (state.search.trim()) {
          if (emptyQueryElem) emptyQueryElem.textContent = `"${state.search.trim()}"`;
          if (emptyQueryWrap) emptyQueryWrap.style.display = 'block';
          if (emptyDefaultWrap) emptyDefaultWrap.style.display = 'none';
        } else {
          if (emptyQueryWrap) emptyQueryWrap.style.display = 'none';
          if (emptyDefaultWrap) emptyDefaultWrap.style.display = 'block';
        }
      }
      return;
    }

    if (emptyContainer) emptyContainer.style.display = 'none';
    if (tableCard) tableCard.style.display = 'block';

    tableBody.innerHTML = customers.map(cust => {
      const initials = getInitials(cust.name);
      const safeName = escapeHtml(cust.name || 'Customer');
      const safeEmail = escapeHtml(cust.email || '');
      const safeCompany = escapeHtml(cust.company || 'Independent Corp');
      const safeId = escapeHtml(cust.id || '');
      const hasZoho = !!cust.zohoId;
      const zohoBadge = hasZoho ? `
        <span class="table-zoho-badge" title="Synced from Zoho CRM (ID: ${escapeHtml(cust.zohoId)})">
          <i class="fa-solid fa-cloud-bolt"></i> Zoho
        </span>
      ` : '';
      const bCount = parseInt(cust.bookingCount, 10) || 0;
      const bookingBadgeClass = bCount > 0 ? 'has-bookings' : 'no-bookings';
      const bookingBadgeText = `${bCount} ${bCount === 1 ? 'booking' : 'bookings'}`;

      return `
        <tr class="customer-row fade-in-row">
          <!-- Customer Avatar & Name -->
          <td>
            <div class="table-cust-cell">
              <div class="table-avatar">
                ${initials}
              </div>
              <div class="table-cust-info">
                <div class="table-cust-name-row">
                  <span class="table-cust-name" title="${safeName}">${safeName}</span>
                  ${zohoBadge}
                </div>
                <span class="table-cust-id">ID: ${safeId}</span>
              </div>
            </div>
          </td>

          <!-- Email -->
          <td>
            <div class="table-email-cell">
              <i class="fa-regular fa-envelope table-cell-icon"></i>
              <a href="mailto:${safeEmail}" class="table-email-link" title="${safeEmail}">
                ${safeEmail}
              </a>
            </div>
          </td>

          <!-- Company -->
          <td>
            <div class="table-company-cell">
              <i class="fa-solid fa-building table-cell-icon"></i>
              <span class="table-company-text" title="${safeCompany}">
                ${safeCompany}
              </span>
            </div>
          </td>

          <!-- Active Bookings Count -->
          <td>
            <span class="table-bookings-badge ${bookingBadgeClass}">
              <i class="fa-solid fa-calendar-check"></i>
              ${bookingBadgeText}
            </span>
          </td>

          <!-- Action: Book Room (Calls /rooms and opens full-screen cards) -->
          <td style="text-align: right; white-space: nowrap;">
            <a href="/rooms?customerId=${encodeURIComponent(cust.id)}" class="btn btn-primary btn-sm table-book-btn">
              <i class="fa-solid fa-calendar-plus"></i>
              <span>Book Room</span>
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination(json) {
    if (!paginationFooter) return;

    if (!json || state.total === 0) {
      paginationFooter.innerHTML = '';
      paginationFooter.style.display = 'none';
      return;
    }

    paginationFooter.style.display = 'flex';
    const startIdx = Math.min((state.page - 1) * state.limit + 1, state.total);
    const endIdx = Math.min(state.page * state.limit, state.total);
    const totalPages = state.totalPages;

    let pageNumsHtml = '';
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= state.page - 1 && p <= state.page + 1)) {
        pageNumsHtml += `
          <button type="button" class="pagination-page-num ${p === state.page ? 'active' : ''}" data-page="${p}">
            ${p}
          </button>
        `;
      } else if (p === state.page - 2 || p === state.page + 2) {
        pageNumsHtml += `<span class="pagination-ellipsis">&hellip;</span>`;
      }
    }

    paginationFooter.innerHTML = `
      <div class="pagination-info">
        Showing <strong>${startIdx}</strong> - <strong>${endIdx}</strong> of <strong>${state.total}</strong> customers
      </div>

      <div class="pagination-controls">
        <button type="button" class="pagination-btn ${state.page <= 1 ? 'disabled' : ''}" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left"></i>
          <span>Previous</span>
        </button>

        <div class="pagination-pages">
          ${pageNumsHtml}
        </div>

        <button type="button" class="pagination-btn ${state.page >= totalPages ? 'disabled' : ''}" data-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''}>
          <span>Next</span>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    `;

    // Bind page button clicks
    paginationFooter.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(btn.getAttribute('data-page'), 10);
        if (targetPage && targetPage !== state.page && targetPage >= 1 && targetPage <= state.totalPages) {
          state.page = targetPage;
          fetchCustomers();
          const tableElem = document.querySelector('.customers-directory-section');
          if (tableElem) {
            tableElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });
  }

  function updateBadge() {
    if (countBadge) {
      countBadge.innerHTML = `<i class="fa-solid fa-database"></i> ${state.total} ${state.total === 1 ? 'profile' : 'profiles'}`;
    }
  }

  function showLoading(isLoading) {
    if (loadingContainer) {
      loadingContainer.style.display = isLoading ? 'flex' : 'none';
    }
    if (tableBody) {
      tableBody.style.opacity = isLoading ? '0.4' : '1';
    }
  }

  function showError(msg) {
    if (!errorContainer) return;
    if (msg) {
      errorContainer.style.display = 'block';
      const msgElem = errorContainer.querySelector('.error-message-text');
      if (msgElem) msgElem.textContent = msg;
      if (tableCard) tableCard.style.display = 'none';
      if (emptyContainer) emptyContainer.style.display = 'none';
    } else {
      errorContainer.style.display = 'none';
    }
  }

  // Search input debouncer
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      state.search = val;
      state.page = 1;

      if (searchClearBtn) {
        searchClearBtn.style.display = val.trim() ? 'inline-flex' : 'none';
      }

      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        fetchCustomers();
      }, 300);
    });

    const searchForm = document.getElementById('customer-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearTimeout(debounceTimeout);
        state.search = searchInput.value;
        state.page = 1;
        fetchCustomers();
      });
    }
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (searchInput) searchInput.value = '';
      searchClearBtn.style.display = 'none';
      state.search = '';
      state.page = 1;
      fetchCustomers();
    });
  }

  if (limitSelect) {
    limitSelect.addEventListener('change', () => {
      state.limit = parseInt(limitSelect.value, 10) || 10;
      state.page = 1;
      fetchCustomers();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchCustomers();
      showNotification('Refreshing customers from /api/customers...', 'success');
    });
  }

  const retryBtn = document.getElementById('api-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      fetchCustomers();
    });
  }

  // Initial fetch on page load
  fetchCustomers(false);

  window.reloadCustomersTable = function() {
    fetchCustomers(false);
  };
}

// --- 2. Full-Screen Rooms Directory Controller (GET /api/rooms with On-Scroll UI) ---
function initRoomsDirectory() {
  const roomsGrid = document.getElementById('rooms-grid-container');
  if (!roomsGrid) return; // Not on rooms directory view

  const searchInput = document.getElementById('rooms-search-input');
  const capacitySelect = document.getElementById('capacity-filter-select');
  const refreshBtn = document.getElementById('rooms-refresh-btn');
  const refreshIcon = document.getElementById('rooms-refresh-icon');
  const countBadge = document.getElementById('rooms-count-badge');
  const loadingContainer = document.getElementById('rooms-loading-state');
  const errorContainer = document.getElementById('rooms-error-state');
  const emptyState = document.getElementById('rooms-empty-state');
  const resetBtn = document.getElementById('rooms-clear-filter-btn');
  const retryBtn = document.getElementById('rooms-retry-btn');
  const infiniteLoader = document.getElementById('rooms-infinite-loading');
  const endIndicator = document.getElementById('rooms-end-indicator');
  const sentinel = document.getElementById('rooms-scroll-sentinel');
  const customerId = roomsGrid.getAttribute('data-customer-id') || '';

  // Pagination State for on-scroll loading
  let state = {
    page: 1,
    limit: 4, // Page batch size for smooth on-scroll loading
    search: '',
    minCapacity: 0,
    total: 0,
    totalPages: 1,
    hasNextPage: true,
    loading: false,
    loadingMore: false,
    renderedRoomIds: new Set()
  };

  // Main Fetcher for Paginated /api/rooms
  async function fetchRooms(isAppend = false) {
    if (isAppend) {
      if (state.loadingMore || !state.hasNextPage) return;
      state.loadingMore = true;
      if (infiniteLoader) infiniteLoader.style.display = 'flex';
    } else {
      state.loading = true;
      state.page = 1;
      state.renderedRoomIds.clear();
      showLoading(true);
      showError(null);
      if (endIndicator) endIndicator.style.display = 'none';
      if (refreshIcon) refreshIcon.classList.add('fa-spin');
    }

    try {
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search.trim(),
        minCapacity: state.minCapacity
      });

      const response = await fetch(`/api/rooms?${params.toString()}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch rooms data.');
      }

      const rooms = json.data || json.rooms || [];
      state.total = json.total !== undefined ? json.total : rooms.length;
      state.totalPages = json.totalPages || Math.max(1, Math.ceil(state.total / state.limit));
      state.hasNextPage = json.hasNextPage !== undefined ? json.hasNextPage : (state.page < state.totalPages);

      if (!isAppend) {
        roomsGrid.innerHTML = '';
      }

      appendRoomCards(rooms, customerId);
      updateBadge();

      // Show/hide empty state
      if (!isAppend && state.total === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (roomsGrid) roomsGrid.style.display = 'none';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        if (roomsGrid) roomsGrid.style.display = 'grid';
      }

      // Show end of list indicator if all items loaded
      if (!state.hasNextPage && state.total > 0) {
        if (endIndicator) endIndicator.style.display = 'flex';
      } else {
        if (endIndicator) endIndicator.style.display = 'none';
      }

    } catch (err) {
      console.error('Error fetching /api/rooms:', err);
      if (!isAppend) {
        showError(err.message);
      } else {
        showNotification('Error loading more rooms on scroll: ' + err.message, 'error');
      }
    } finally {
      if (isAppend) {
        state.loadingMore = false;
        if (infiniteLoader) infiniteLoader.style.display = 'none';
      } else {
        state.loading = false;
        showLoading(false);
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
      }
    }
  }

  function appendRoomCards(rooms, custId) {
    if (!rooms || rooms.length === 0) return;

    const fragment = document.createDocumentFragment();

    rooms.forEach(room => {
      // Avoid duplicate cards if fast scrolling
      if (state.renderedRoomIds.has(room.id)) return;
      state.renderedRoomIds.add(room.id);

      const card = document.createElement('div');
      card.className = 'fullscreen-room-card fade-in-row';
      card.setAttribute('data-room-id', room.id);
      card.setAttribute('data-room-name', (room.name || '').toLowerCase());
      card.setAttribute('data-room-type', (room.type || '').toLowerCase());
      card.setAttribute('data-room-capacity', room.capacity);
      card.setAttribute('data-room-floor', (room.floor || '').toLowerCase());

      const amenitiesHtml = (room.amenities || []).map(a => `
        <span class="room-amenity-pill">
          <i class="fa-solid fa-check"></i> ${escapeHtml(a)}
        </span>
      `).join('');

      card.innerHTML = `
        <div class="room-image-hero">
          <img src="${escapeHtml(room.image)}" alt="${escapeHtml(room.name)}" class="room-card-photo" loading="lazy">
          <div class="room-image-overlay"></div>
          
          <div class="room-rate-tag">
            <span class="rate-currency">$</span>
            <span class="rate-number">${room.hourlyRate}</span>
            <span class="rate-unit">/ hr</span>
          </div>

          <div class="room-top-tags">
            <span class="room-type-badge">${escapeHtml(room.type)}</span>
            <span class="room-floor-badge"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(room.floor)}</span>
          </div>

          <div class="room-capacity-badge">
            <i class="fa-solid fa-users"></i> ${room.capacity} Seats
          </div>
        </div>

        <div class="room-card-content">
          <div class="room-title-row">
            <h3 class="room-name">${escapeHtml(room.name)}</h3>
          </div>

          <p class="room-desc">
            ${escapeHtml(room.description)}
          </p>

          <div class="room-amenities-section">
            <span class="amenities-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Included Amenities</span>
            <div class="amenities-chips-wrap">
              ${amenitiesHtml}
            </div>
          </div>

          <div class="room-card-footer">
            <div class="room-quick-meta">
              <span class="meta-item"><i class="fa-solid fa-bolt" style="color: #67e8f9;"></i> Instant Booking</span>
              <span class="meta-item"><i class="fa-solid fa-calendar-check" style="color: #6ee7b7;"></i> Live Slots</span>
            </div>

            <button 
              type="button" 
              class="btn btn-primary select-room-btn" 
              onclick="selectRoomAndRedirect('${escapeHtml(room.id)}', '${escapeHtml(custId)}')"
            >
              <span>Check Slots &amp; Availability</span>
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    roomsGrid.appendChild(fragment);
  }

  function updateBadge() {
    if (countBadge) {
      const renderedCount = state.renderedRoomIds.size;
      countBadge.innerHTML = `<i class="fa-solid fa-cubes"></i> Showing ${renderedCount} of ${state.total} ${state.total === 1 ? 'Space' : 'Spaces'}`;
    }
  }

  function showLoading(loading) {
    if (loadingContainer) loadingContainer.style.display = loading ? 'flex' : 'none';
    if (roomsGrid && loading) roomsGrid.style.display = 'none';
  }

  function showError(msg) {
    if (!errorContainer) return;
    if (msg) {
      errorContainer.style.display = 'block';
      const msgElem = errorContainer.querySelector('.error-message-text');
      if (msgElem) msgElem.textContent = msg;
      if (roomsGrid) roomsGrid.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      if (countBadge) countBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error loading rooms`;
    } else {
      errorContainer.style.display = 'none';
    }
  }

  // --- On-Scroll Intersection Observer for Infinite Loading ---
  if (sentinel && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && state.hasNextPage && !state.loading && !state.loadingMore) {
          state.page++;
          fetchRooms(true);
        }
      });
    }, {
      rootMargin: '200px'
    });

    observer.observe(sentinel);
  } else {
    // Fallback Scroll Listener
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (state.hasNextPage && !state.loading && !state.loadingMore) {
          const scrollPosition = window.innerHeight + window.scrollY;
          const threshold = document.documentElement.offsetHeight - 400;
          if (scrollPosition >= threshold) {
            state.page++;
            fetchRooms(true);
          }
        }
      }, 100);
    });
  }

  // Search input debouncer
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        fetchRooms(false);
      }, 300);
    });
  }

  if (capacitySelect) {
    capacitySelect.addEventListener('change', (e) => {
      state.minCapacity = parseInt(e.target.value, 10) || 0;
      fetchRooms(false);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (capacitySelect) capacitySelect.value = '0';
      state.search = '';
      state.minCapacity = 0;
      fetchRooms(false);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchRooms(false);
      showNotification('Refreshing meeting rooms from GET /api/rooms API...', 'success');
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      fetchRooms(false);
    });
  }

  // Initial fetch on page load!
  fetchRooms(false);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// --- 3. Room Availability & Free/Busy Slots Controller (GET /api/rooms/:id/availability) ---
// --- 3. Room Availability & Instant Slot Booking Controller (GET /api/rooms/:id/availability -> POST /bookings) ---
function initRoomAvailability() {
  const datePicker = document.getElementById('slot-date-picker');
  if (!datePicker) return; // Not on room availability view

  const roomId = datePicker.getAttribute('data-room-id');
  const customerId = datePicker.getAttribute('data-customer-id') || '';
  const customerName = datePicker.getAttribute('data-customer-name') || 'Customer';
  const roomName = datePicker.getAttribute('data-room-name') || 'Meeting Room';
  const refreshSlotsBtn = document.getElementById('refresh-slots-btn');
  const refreshSlotsIcon = document.getElementById('refresh-slots-icon');
  const freeSlotsGrid = document.getElementById('free-slots-grid');
  const busySlotsGrid = document.getElementById('busy-slots-grid');
  const freeCountBadge = document.getElementById('free-count-badge');
  const busyCountBadge = document.getElementById('busy-count-badge');
  const totalCountBadge = document.getElementById('total-count-badge');
  const freeHeaderCount = document.getElementById('free-slots-header-count');
  const busyHeaderCount = document.getElementById('busy-slots-header-count');
  const apiDateDisplay = document.getElementById('api-date-display');
  const loadingState = document.getElementById('slots-loading-state');
  const quickDateBtns = document.querySelectorAll('.quick-date-btn');

  let isBookingInProgress = false;

  // Helper to format date offset
  function getDateString(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  // Fetch slots availability for a given date
  async function fetchAvailability(targetDate, updateUrl = true) {
    if (loadingState) loadingState.style.display = 'flex';
    if (refreshSlotsIcon) refreshSlotsIcon.classList.add('fa-spin');

    try {
      const endpoint = `/api/rooms/${encodeURIComponent(roomId)}/availability?date=${encodeURIComponent(targetDate)}`;
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch slots.');
      }

      const freeSlots = json.freeSlots || [];
      const busySlots = json.busySlots || [];
      const allSlots = json.slots || [];

      // Update date references
      if (apiDateDisplay) apiDateDisplay.textContent = targetDate;
      if (datePicker) datePicker.value = targetDate;

      // Update counter badges
      if (freeCountBadge) freeCountBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>${freeSlots.length}</strong> Free`;
      if (busyCountBadge) busyCountBadge.innerHTML = `<i class="fa-solid fa-lock"></i> <strong>${busySlots.length}</strong> Busy`;
      if (totalCountBadge) totalCountBadge.innerHTML = `<i class="fa-solid fa-clock"></i> <strong>${allSlots.length}</strong> Total`;
      if (freeHeaderCount) freeHeaderCount.textContent = freeSlots.length;
      if (busyHeaderCount) busyHeaderCount.textContent = busySlots.length;

      // Render Free Slots
      renderFreeSlots(freeSlots, json.room ? json.room.hourlyRate : 0);

      // Render Busy Slots
      renderBusySlots(busySlots);

      if (updateUrl) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('date', targetDate);
        if (customerId) newUrl.searchParams.set('customerId', customerId);
        window.history.replaceState({}, '', newUrl.toString());
      }
    } catch (err) {
      console.error('Error fetching room availability:', err);
      showNotification('Error loading slots: ' + err.message, 'error');
    } finally {
      if (loadingState) loadingState.style.display = 'none';
      if (refreshSlotsIcon) refreshSlotsIcon.classList.remove('fa-spin');
    }
  }

  function renderFreeSlots(slots, hourlyRate) {
    if (!freeSlotsGrid) return;

    if (!slots || slots.length === 0) {
      freeSlotsGrid.innerHTML = `
        <div class="no-slots-notice">
          <i class="fa-solid fa-calendar-xmark"></i>
          <span>No free slots remaining on this day. Please pick a different date above.</span>
        </div>
      `;
      return;
    }

    freeSlotsGrid.innerHTML = slots.map(slot => `
      <div 
        class="modern-slot-card free-slot-card fade-in-row" 
        data-start-time="${escapeHtml(slot.startTime)}"
        data-end-time="${escapeHtml(slot.endTime)}"
        data-slot-label="${escapeHtml(slot.label)}"
        data-slot-time="${escapeHtml(slot.time)}"
        data-slot-period="${escapeHtml(slot.period)}"
        title="Click to instantly book ${escapeHtml(slot.label)}"
      >
        <div class="slot-card-top">
          <span class="slot-period-tag">${escapeHtml(slot.period)}</span>
          <span class="slot-available-pill">
            <i class="fa-solid fa-circle-dot"></i> Free
          </span>
        </div>
        <div class="slot-time-display">
          ${escapeHtml(slot.label)}
        </div>
        <div class="slot-card-bottom">
          <span class="slot-price-hint">$${hourlyRate}/hr</span>
          <span class="slot-action-text"><i class="fa-solid fa-calendar-check"></i> Book Now</span>
        </div>
      </div>
    `).join('');

    bindSlotCardEvents();
  }

  function renderBusySlots(slots) {
    if (!busySlotsGrid) return;

    if (!slots || slots.length === 0) {
      busySlotsGrid.innerHTML = `
        <div class="all-free-notice">
          <i class="fa-solid fa-circle-check"></i>
          <span>All slots are wide open! Room is fully available throughout the entire day.</span>
        </div>
      `;
      return;
    }

    busySlotsGrid.innerHTML = slots.map(slot => `
      <div class="modern-slot-card busy-slot-card fade-in-row">
        <div class="slot-card-top">
          <span class="slot-period-tag">${escapeHtml(slot.period)}</span>
          <span class="slot-busy-pill">
            <i class="fa-solid fa-lock"></i> Reserved
          </span>
        </div>
        <div class="slot-time-display">
          ${escapeHtml(slot.label)}
        </div>
        <div class="slot-card-bottom">
          <span class="slot-reserved-by" title="${escapeHtml(slot.bookedBy || 'Reserved')}">
            <i class="fa-solid fa-user"></i> ${escapeHtml(slot.bookedBy || 'Reserved')}
          </span>
          <span class="slot-busy-status">Locked</span>
        </div>
      </div>
    `).join('');
  }

  // Directly call API POST /bookings (customer ID, room ID, start, end, purpose) upon selecting slot
  async function bookSlotDirectly(slotCard, startTime, endTime) {
    if (isBookingInProgress) return;
    isBookingInProgress = true;

    // Immediately lock all free slot cards to prevent duplicate clicks / double submits
    document.querySelectorAll('.free-slot-card').forEach(c => {
      c.style.pointerEvents = 'none';
      c.style.opacity = '0.65';
      c.setAttribute('aria-disabled', 'true');
    });

    const originalHtml = slotCard.innerHTML;
    slotCard.classList.add('booking-in-progress');
    slotCard.style.opacity = '1';
    slotCard.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem 0; gap: 0.5rem;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; color: #6ee7b7;"></i>
        <span style="font-size: 0.85rem; font-weight: 700; color: #fff;">Reserving space...</span>
      </div>
    `;

    const currentDate = datePicker.value || getDateString(0);
    const startPayload = `${currentDate} ${startTime}`;
    const endPayload = `${currentDate} ${endTime}`;
    const purposePayload = `Meeting - ${customerName || 'Client'}`;

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          customerId: customerId,
          roomId: roomId,
          start: startPayload,
          end: endPayload,
          purpose: purposePayload,
          date: currentDate
        })
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to book slot.');
      }

      const booking = json.data || {};

      // Show high-visibility popup confirmation and redirect to bookings page
      showBookingSuccessModal(booking, startTime, endTime, currentDate);

    } catch (err) {
      console.error('Error in direct POST /bookings:', err);
      showNotification(`Booking failed: ${err.message}`, 'error');
      slotCard.classList.remove('booking-in-progress');
      slotCard.innerHTML = originalHtml;

      // Re-enable slot cards on failure
      document.querySelectorAll('.free-slot-card').forEach(c => {
        c.style.pointerEvents = 'auto';
        c.style.opacity = '1';
        c.removeAttribute('aria-disabled');
      });
      // Also refresh availability to show live updated status
      fetchAvailability(currentDate, false);
    } finally {
      isBookingInProgress = false;
    }
  }

  // Popup Confirmation Modal & Redirect to /bookings
  function showBookingSuccessModal(booking, startTime, endTime, currentDate) {
    // Remove existing modal if present
    const existingModal = document.getElementById('booking-confirmation-popup');
    if (existingModal) existingModal.remove();

    const bookingId = booking.id || 'Confirmed';
    const displayRoom = booking.roomName || roomName;
    const displayCust = booking.customerName || customerName;
    const displayDate = booking.date || currentDate;
    const displayTime = (booking.startTime && booking.endTime) ? `${booking.startTime} - ${booking.endTime}` : `${startTime} - ${endTime}`;
    const isCalendarSynced = !!booking.googleEventId || !!booking.calendarSynced;

    const modal = document.createElement('div');
    modal.id = 'booking-confirmation-popup';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content booking-success-modal-content fade-in-row">
        <div class="success-icon-wrap">
          <i class="fa-solid fa-circle-check"></i>
        </div>

        <h2 class="success-title">Booking Confirmed!</h2>
        <p class="success-subtitle">Meeting room successfully reserved &amp; saved to PostgreSQL.</p>

        <div class="success-details-card">
          <div class="success-detail-row">
            <span class="label"><i class="fa-solid fa-ticket"></i> Reference ID:</span>
            <span class="value" style="color: var(--primary-400); font-family: monospace;">${escapeHtml(bookingId)}</span>
          </div>
          <div class="success-detail-row">
            <span class="label"><i class="fa-solid fa-door-open"></i> Space:</span>
            <span class="value">${escapeHtml(displayRoom)}</span>
          </div>
          <div class="success-detail-row">
            <span class="label"><i class="fa-regular fa-calendar-check"></i> Schedule:</span>
            <span class="value" style="color: #6ee7b7;">${escapeHtml(displayDate)} &bull; ${escapeHtml(displayTime)}</span>
          </div>
          <div class="success-detail-row">
            <span class="label"><i class="fa-solid fa-user-check"></i> Customer:</span>
            <span class="value">${escapeHtml(displayCust)}</span>
          </div>
          ${isCalendarSynced ? `
            <div class="success-detail-row" style="margin-top: 0.25rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.08);">
              <span class="label"><i class="fa-solid fa-calendar-days" style="color: #60a5fa;"></i> Google Calendar:</span>
              <span class="value" style="color: #93c5fd; font-size: 0.8rem;"><i class="fa-solid fa-check-double"></i> Synced</span>
            </div>
          ` : ''}
        </div>

        <div class="redirect-countdown-bar">
          <div class="redirect-countdown-fill" id="countdown-fill"></div>
        </div>

        <p class="redirect-note" id="redirect-timer-text">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Redirecting to <strong>Bookings Overview</strong> in <span id="countdown-num">3</span>s...
        </p>

        <div class="success-actions-row">
          <a href="/bookings?success=${encodeURIComponent('Meeting room booked successfully! Reference: ' + bookingId)}" class="btn btn-primary btn-lg" style="width: 100%; justify-content: center; gap: 0.5rem;">
            <span>Go to Bookings Now</span>
            <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate progress bar
    setTimeout(() => {
      const fill = document.getElementById('countdown-fill');
      if (fill) fill.style.width = '0%';
    }, 50);

    let secondsLeft = 3;
    const countdownElem = document.getElementById('countdown-num');

    const countdownInterval = setInterval(() => {
      secondsLeft--;
      if (countdownElem) countdownElem.textContent = String(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        const successUrl = `/bookings?success=${encodeURIComponent('Meeting room booked successfully! Reference: ' + bookingId)}`;
        window.location.href = successUrl;
      }
    }, 1000);
  }

  function bindSlotCardEvents() {
    const freeCards = document.querySelectorAll('.free-slot-card');
    freeCards.forEach(card => {
      card.addEventListener('click', () => {
        const startTime = card.getAttribute('data-start-time');
        const endTime = card.getAttribute('data-end-time');
        bookSlotDirectly(card, startTime, endTime);
      });
    });
  }

  // Bind date picker changes
  datePicker.addEventListener('change', (e) => {
    if (e.target.value) {
      fetchAvailability(e.target.value);
    }
  });

  // Quick date shortcut buttons
  quickDateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const offset = parseInt(btn.getAttribute('data-offset') || '0', 10);
      const targetDate = getDateString(offset);
      quickDateBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fetchAvailability(targetDate);
    });
  });

  // Refresh button
  if (refreshSlotsBtn) {
    refreshSlotsBtn.addEventListener('click', () => {
      fetchAvailability(datePicker.value);
      showNotification('Refreshed slot availability', 'success');
    });
  }

  // Initial event binding for SSR cards
  bindSlotCardEvents();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// --- 4. Modals & Dialogs ---
function initModals() {
  const modalTriggers = document.querySelectorAll('[data-modal-target]');
  const modalCloses = document.querySelectorAll('[data-modal-close]');

  modalTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-modal-target');
      const targetModal = document.getElementById(targetId);
      if (targetModal) {
        targetModal.classList.add('active');
      }
    });
  });

  modalCloses.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
      }
    });
  });
}

// --- 5. CRM & Calendar Sync Triggers ---
function initSyncActions() {
  const zohoSyncForm = document.getElementById('zoho-sync-form');
  if (zohoSyncForm) {
    zohoSyncForm.addEventListener('submit', () => {
      const btn = zohoSyncForm.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Syncing Zoho CRM...</span>`;
      }
    });
  }
}

// --- 6. Live Bookings API View Controller (GET /bookings) ---
function initBookingsApiView() {
  const tableBody = document.getElementById('bookings-table-body');
  const filterPanel = document.getElementById('bookings-filter-panel');
  if (!tableBody || !filterPanel) return; // Not on bookings view

  // DOM Elements
  const searchInput = document.getElementById('booking-search-input');
  const searchClearBtn = document.getElementById('booking-search-clear');
  const roomSelect = document.getElementById('booking-room-filter');
  const customerSelect = document.getElementById('booking-customer-filter');
  const statusSelect = document.getElementById('booking-status-filter');
  const startDateInput = document.getElementById('booking-start-date');
  const endDateInput = document.getElementById('booking-end-date');
  const presetBtns = document.querySelectorAll('.date-preset-btn');
  const refreshBtn = document.getElementById('booking-refresh-btn');
  const refreshIcon = document.getElementById('booking-refresh-icon');
  const clearFiltersBtn = document.getElementById('booking-clear-filters-btn');
  const emptyResetBtn = document.getElementById('empty-reset-filters-btn');
  const loadingState = document.getElementById('bookings-loading-state');
  const tableWrap = document.getElementById('bookings-table-wrap');
  const emptyState = document.getElementById('bookings-empty-state');
  const renderedCount = document.getElementById('bookings-rendered-count');

  // KPI elements
  const kpiTotal = document.getElementById('kpi-total-bookings');
  const kpiConfirmed = document.getElementById('kpi-confirmed-bookings');
  const kpiCancelled = document.getElementById('kpi-cancelled-bookings');
  const kpiRevenue = document.getElementById('kpi-total-revenue');

  // Parse initial query params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const state = {
    search: urlParams.get('search') || (searchInput ? searchInput.value : ''),
    roomId: urlParams.get('roomId') || (roomSelect ? roomSelect.value : ''),
    customerId: urlParams.get('customerId') || (customerSelect ? customerSelect.value : ''),
    status: urlParams.get('status') || (statusSelect ? statusSelect.value : ''),
    startDate: urlParams.get('startDate') || (startDateInput ? startDateInput.value : ''),
    endDate: urlParams.get('endDate') || (endDateInput ? endDateInput.value : '')
  };

  // Sync inputs with initial state
  if (searchInput && state.search) searchInput.value = state.search;
  if (roomSelect && state.roomId) roomSelect.value = state.roomId;
  if (customerSelect && state.customerId) customerSelect.value = state.customerId;
  if (statusSelect && state.status) statusSelect.value = state.status;
  if (startDateInput && state.startDate) startDateInput.value = state.startDate;
  if (endDateInput && state.endDate) endDateInput.value = state.endDate;

  function updateSearchClearVisibility() {
    if (searchClearBtn && searchInput) {
      searchClearBtn.style.display = searchInput.value ? 'inline-flex' : 'none';
    }
  }

  // Format Helper for YYYY-MM-DD
  function formatDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Update KPI counters dynamically
  function updateKPIs(bookings) {
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'Confirmed');
    const cancelled = bookings.filter(b => b.status === 'Cancelled');
    const revenue = confirmed.reduce((acc, b) => acc + (parseFloat(b.totalCost) || 0), 0);

    if (kpiTotal) kpiTotal.textContent = String(total);
    if (kpiConfirmed) kpiConfirmed.textContent = String(confirmed.length);
    if (kpiCancelled) kpiCancelled.textContent = String(cancelled.length);
    if (kpiRevenue) kpiRevenue.textContent = `$${revenue.toLocaleString()}`;
    if (renderedCount) renderedCount.textContent = String(total);
  }

  // Render bookings in table
  function renderBookingsTable(bookings) {
    if (!tableBody) return;

    if (!bookings || bookings.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (tableWrap) tableWrap.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (tableWrap) {
      tableWrap.style.display = 'block';
      tableWrap.style.opacity = '1';
    }

    tableBody.innerHTML = bookings.map(booking => {
      const isConfirmed = booking.status === 'Confirmed';
      const attendees = booking.attendees || 2;
      const notesHtml = booking.notes 
        ? `<span>&bull;</span><span title="${escapeHtml(booking.notes)}" style="color: var(--text-muted);"><i class="fa-solid fa-note-sticky"></i> Note</span>`
        : '';
      const emailHtml = booking.customerEmail 
        ? `<div style="font-size: 0.74rem; color: var(--text-dim);">${escapeHtml(booking.customerEmail)}</div>`
        : '';
      const roomSubtitle = `${escapeHtml(booking.roomFloor || '')} ${booking.roomType ? '(' + escapeHtml(booking.roomType) + ')' : ''}`;
      const calBadge = booking.googleEventId 
        ? `<div><span class="cal-synced-badge" title="Synced to Google Calendar"><i class="fa-brands fa-google"></i> Synced</span></div>`
        : '';

      const statusBadgeHtml = isConfirmed
        ? `<span class="status-badge confirmed" id="status-badge-${booking.id}"><i class="fa-solid fa-circle-check"></i> Confirmed</span>`
        : `<span class="status-badge cancelled" id="status-badge-${booking.id}"><i class="fa-solid fa-ban"></i> Cancelled</span>`;

      const actionHtml = isConfirmed
        ? `<button type="button" class="btn-danger-outline cancel-booking-btn" data-booking-id="${booking.id}" data-customer-name="${escapeHtml(booking.customerName)}" title="Cancel Booking"><i class="fa-solid fa-xmark"></i> Cancel</button>`
        : `<span style="font-size: 0.8rem; color: var(--text-dim); font-style: italic;">Cancelled</span>`;

      return `
        <tr id="booking-row-${booking.id}">
          <td>
            <span class="booking-ref-badge">
              ${escapeHtml(booking.id)}
            </span>
            ${calBadge}
          </td>
          <td>
            <div style="font-weight: 700; color: #fff; margin-bottom: 0.15rem;">
              ${escapeHtml(booking.title)}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-dim); display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span><i class="fa-solid fa-users" style="margin-right: 0.25rem;"></i> ${attendees} Attendees</span>
              ${notesHtml}
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #fff;">
              ${escapeHtml(booking.customerName)}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">
              ${escapeHtml(booking.customerCompany)}
            </div>
            ${emailHtml}
          </td>
          <td>
            <div style="font-weight: 600; color: var(--accent-cyan);">
              ${escapeHtml(booking.roomName)}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-dim);">
              ${roomSubtitle}
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #fff;">
              <i class="fa-regular fa-calendar" style="color: var(--primary-400); margin-right: 0.3rem;"></i>
              ${escapeHtml(booking.date)}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">
              <i class="fa-regular fa-clock" style="margin-right: 0.3rem;"></i>
              ${escapeHtml((booking.startTime && booking.endTime) ? booking.startTime + ' - ' + booking.endTime : 'Scheduled Time')}
            </div>
          </td>
          <td>
            <span style="font-weight: 700; color: var(--accent-emerald); font-size: 0.95rem;">
              $${booking.totalCost}
            </span>
          </td>
          <td>
            ${statusBadgeHtml}
          </td>
          <td style="text-align: right;">
            ${actionHtml}
          </td>
        </tr>
      `;
    }).join('');

    // Attach cancel button listeners
    bindCancelButtons();
  }

  // Cancel Booking Action via API
  function bindCancelButtons() {
    const cancelBtns = document.querySelectorAll('.cancel-booking-btn');
    cancelBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const bookingId = btn.getAttribute('data-booking-id');
        const custName = btn.getAttribute('data-customer-name') || 'this customer';

        if (!confirm(`Are you sure you want to cancel booking ${bookingId} for ${custName}?`)) {
          return;
        }

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Cancelling...`;

        try {
          const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
          });

          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to cancel reservation.');
          }

          const calFeedback = json.calendarDeleted ? ' and removed from Google Calendar.' : '.';
          showNotification(`Booking ${bookingId} cancelled successfully${calFeedback}`, 'success');
          // Refresh list from GET /bookings
          fetchBookings(false);
        } catch (err) {
          showNotification(err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-xmark"></i> Cancel`;
        }
      });
    });
  }

  // Fetch Bookings via GET /api/bookings API
  async function fetchBookings(showToast = false) {
    if (loadingState) loadingState.style.display = 'block';
    if (tableWrap) tableWrap.style.opacity = '0.4';
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    const params = new URLSearchParams();
    if (state.search.trim()) params.append('search', state.search.trim());
    if (state.roomId) params.append('roomId', state.roomId);
    if (state.customerId) params.append('customerId', state.customerId);
    if (state.status) params.append('status', state.status);
    if (state.startDate) params.append('startDate', state.startDate);
    if (state.endDate) params.append('endDate', state.endDate);

    try {
      const endpoint = `/api/bookings?${params.toString()}`;
      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load bookings.');
      }

      const bookings = json.data || [];
      renderBookingsTable(bookings);
      updateKPIs(bookings);

      // Update URL query string without reloading page
      const currentUrl = new URL(window.location);
      currentUrl.search = params.toString();
      window.history.replaceState({}, '', currentUrl.toString());

      if (showToast) {
        showNotification(`Fetched ${bookings.length} meeting bookings.`, 'success');
      }
    } catch (err) {
      console.error('Error in fetchBookings:', err);
      showNotification(`Error: ${err.message}`, 'error');
    } finally {
      if (loadingState) loadingState.style.display = 'none';
      if (tableWrap) tableWrap.style.opacity = '1';
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
  }

  // Debounced search
  let searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      updateSearchClearVisibility();
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        fetchBookings(false);
      }, 300);
    });
  }

  if (searchClearBtn && searchInput) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      updateSearchClearVisibility();
      fetchBookings(false);
    });
  }

  // Dropdown filter change listeners
  if (roomSelect) {
    roomSelect.addEventListener('change', (e) => {
      state.roomId = e.target.value;
      fetchBookings(false);
    });
  }

  if (customerSelect) {
    customerSelect.addEventListener('change', (e) => {
      state.customerId = e.target.value;
      fetchBookings(false);
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      state.status = e.target.value;
      fetchBookings(false);
    });
  }

  // Date Range inputs change listeners
  if (startDateInput) {
    startDateInput.addEventListener('change', (e) => {
      state.startDate = e.target.value;
      presetBtns.forEach(b => b.classList.remove('active'));
      fetchBookings(false);
    });
  }

  if (endDateInput) {
    endDateInput.addEventListener('change', (e) => {
      state.endDate = e.target.value;
      presetBtns.forEach(b => b.classList.remove('active'));
      fetchBookings(false);
    });
  }

  // Preset Date shortcuts
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const range = btn.getAttribute('data-range');
      const now = new Date();

      if (range === 'all') {
        state.startDate = '';
        state.endDate = '';
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
      } else if (range === 'today') {
        const todayStr = formatDate(now);
        state.startDate = todayStr;
        state.endDate = todayStr;
        if (startDateInput) startDateInput.value = todayStr;
        if (endDateInput) endDateInput.value = todayStr;
      } else if (range === 'next7') {
        const todayStr = formatDate(now);
        const endD = new Date(now);
        endD.setDate(now.getDate() + 7);
        const endStr = formatDate(endD);
        state.startDate = todayStr;
        state.endDate = endStr;
        if (startDateInput) startDateInput.value = todayStr;
        if (endDateInput) endDateInput.value = endStr;
      } else if (range === 'thisMonth') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        state.startDate = formatDate(firstDay);
        state.endDate = formatDate(lastDay);
        if (startDateInput) startDateInput.value = state.startDate;
        if (endDateInput) endDateInput.value = state.endDate;
      }

      fetchBookings(false);
    });
  });

  // Clear filters
  function resetAllFilters() {
    state.search = '';
    state.roomId = '';
    state.customerId = '';
    state.status = '';
    state.startDate = '';
    state.endDate = '';

    if (searchInput) searchInput.value = '';
    if (roomSelect) roomSelect.value = '';
    if (customerSelect) customerSelect.value = '';
    if (statusSelect) statusSelect.value = '';
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
    updateSearchClearVisibility();

    presetBtns.forEach(b => {
      if (b.getAttribute('data-range') === 'all') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    fetchBookings(true);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', resetAllFilters);
  }

  if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', resetAllFilters);
  }

  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchBookings(true);
    });
  }

  // Bind initial cancel buttons from SSR
  bindCancelButtons();

  // Trigger initial live fetch on page load: GET /api/bookings
  fetchBookings(false);
}

