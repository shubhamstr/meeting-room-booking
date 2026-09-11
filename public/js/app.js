document.addEventListener('DOMContentLoaded', () => {
  initCustomerTableApi();
  initRoomAndSlotBooking();
  initModals();
  initSyncActions();
});

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

          <!-- Action: Book Room -->
          <td style="text-align: right;">
            <a href="/book?customerId=${encodeURIComponent(cust.id)}" class="btn btn-primary btn-sm table-book-btn">
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

  // Initial fetch on page load / browser refresh!
  fetchCustomers(false);

  // Expose reload method globally so Zoho CRM sync / Calendar sync can refresh table without full reload
  window.reloadCustomersTable = function() {
    fetchCustomers(false);
  };
}
