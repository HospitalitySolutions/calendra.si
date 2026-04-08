(function () {
  const DEFAULTS = {
    baseUrl: 'https://app.calendra.si',
    tenant: '',
    locale: 'en',
    primaryColor: '',
    accentColor: '',
    mode: 'inline',
    mountSelector: null,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  class CalendraBookingWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.state = {
        loading: true,
        saving: false,
        error: '',
        config: null,
        services: [],
        selectedServiceId: null,
        selectedDate: '',
        slots: [],
        selectedSlot: null,
        form: { firstName: '', lastName: '', email: '', phone: '' },
        bookingSuccess: null,
      };
      this.options = { ...DEFAULTS };
    }

    static get observedAttributes() {
      return ['tenant', 'base-url', 'locale', 'primary-color', 'accent-color'];
    }

    connectedCallback() {
      this.readOptions();
      this.render();
      this.bootstrap().catch((error) => {
        this.setState({
          loading: false,
          error: this.normalizeError(error, 'Failed to load booking widget.'),
        });
      });
    }

    attributeChangedCallback() {
      this.readOptions();
    }

    readOptions() {
      this.options = {
        ...DEFAULTS,
        tenant: this.getAttribute('tenant') || this.dataset.tenant || DEFAULTS.tenant,
        baseUrl: this.getAttribute('base-url') || this.dataset.baseUrl || DEFAULTS.baseUrl,
        locale: this.getAttribute('locale') || this.dataset.locale || DEFAULTS.locale,
        primaryColor: this.getAttribute('primary-color') || this.dataset.primaryColor || DEFAULTS.primaryColor,
        accentColor: this.getAttribute('accent-color') || this.dataset.accentColor || DEFAULTS.accentColor,
      };

      const computed = getComputedStyle(this);
      const inheritedPrimary = computed.getPropertyValue('--calendra-primary').trim()
        || computed.getPropertyValue('--brand-primary').trim()
        || computed.getPropertyValue('--primary-color').trim()
        || computed.color.trim();
      const inheritedAccent = computed.getPropertyValue('--calendra-accent').trim()
        || computed.getPropertyValue('--brand-accent').trim()
        || computed.getPropertyValue('--accent-color').trim()
        || inheritedPrimary;

      this.options.primaryColor = this.options.primaryColor || inheritedPrimary || '#1672f3';
      this.options.primaryColor = this.options.primaryColor || inheritedPrimary || '#1672f3';
      this.options.accentColor = this.options.accentColor || inheritedAccent || this.options.primaryColor || '#f9941f';
    }

    async bootstrap() {
      if (!this.options.tenant) {
        throw new Error('Missing tenant code. Set the tenant attribute on <calendra-booking-widget>.');
      }

      const [config, services] = await Promise.all([
        this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/config`),
        this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/services`),
      ]);

      const selectedServiceId = services.length ? services[0].id : null;
      const selectedDate = this.todayInWidgetTimezone();

      this.setState({
        loading: false,
        config,
        services,
        selectedServiceId,
        selectedDate,
      });

      await this.loadAvailability();
    }

    todayInWidgetTimezone() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    async fetchJson(path, options) {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || `Request failed with status ${response.status}`);
      }
      return data;
    }

    async loadAvailability() {
      if (!this.state.selectedServiceId || !this.state.selectedDate) return;

      this.setState({ error: '', slots: [], selectedSlot: null });
      try {
        const params = new URLSearchParams({
          typeId: String(this.state.selectedServiceId),
          date: this.state.selectedDate,
        });
        const data = await this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/availability?${params.toString()}`);
        this.setState({ slots: data.slots || [] });
      } catch (error) {
        this.setState({ error: this.normalizeError(error, 'Failed to load availability.') });
      }
    }

    setState(patch) {
      this.state = { ...this.state, ...patch };
      this.render();
    }

    normalizeError(error, fallback) {
      return error instanceof Error ? error.message : fallback;
    }

    updateForm(field, value) {
      this.setState({ form: { ...this.state.form, [field]: value } });
    }

    async submitBooking() {
      const { selectedServiceId, selectedDate, selectedSlot, form, config } = this.state;
      const missing = [];
      if (!selectedServiceId) missing.push('service');
      if (!selectedDate) missing.push('date');
      if (config?.availabilityEnabled && !selectedSlot) missing.push('time');
      if (!form.firstName.trim()) missing.push('first name');
      if (!form.lastName.trim()) missing.push('last name');
      if (!form.email.trim()) missing.push('email');
      if (!form.phone.trim()) missing.push('phone');

      if (missing.length) {
        this.setState({ error: `Please complete: ${missing.join(', ')}.` });
        return;
      }

      const fallbackTime = this.shadowRoot.getElementById('manual-time')?.value || '';
      if (!config?.availabilityEnabled && !fallbackTime) {
        this.setState({ error: 'Please choose a time.' });
        return;
      }

      this.setState({ saving: true, error: '' });
      try {
        const payload = {
          typeId: selectedServiceId,
          date: selectedDate,
          startTime: config?.availabilityEnabled ? selectedSlot.startTime : `${selectedDate}T${fallbackTime}:00`,
          consultantId: config?.availabilityEnabled ? selectedSlot.consultantId : null,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        };

        const booking = await this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/bookings`, {
          method: 'POST',
          body: payload,
        });

        this.setState({
          saving: false,
          bookingSuccess: booking,
          selectedSlot: null,
        });
      } catch (error) {
        this.setState({ saving: false, error: this.normalizeError(error, 'Booking failed.') });
      }
    }

    styles() {
      return `
        :host {
          --calendra-primary: ${this.options.primaryColor};
          --calendra-accent: ${this.options.accentColor};
          --calendra-bg: #f9f8f5;
          --calendra-surface: #fdfdfc;
          --calendra-surface-soft: #fbfaf7;
          --calendra-text: #1b1e2d;
          --calendra-muted: #63697d;
          --calendra-border: #e7e4df;
          --calendra-success-bg: rgba(5, 150, 105, 0.1);
          --calendra-success-text: #047857;
          display: block;
          color: var(--calendra-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        * { box-sizing: border-box; }
        .widget {
          background: var(--calendra-bg);
          border: 1px solid var(--calendra-border);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 18px 44px rgba(24,27,37,0.12);
        }
        .header {
          padding: 24px;
          border-bottom: 1px solid var(--calendra-border);
          background: var(--calendra-surface);
        }
        .title { margin: 8px 0 4px; font-size: 28px; font-weight: 700; }
        .subtitle, .muted { color: var(--calendra-muted); font-size: 14px; }
        .badge {
          display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px;
          background: color-mix(in srgb, var(--calendra-primary) 10%, white);
          color: var(--calendra-primary); font-size: 12px; font-weight: 700;
        }
        .body { padding: 24px; display: grid; gap: 24px; background: var(--calendra-surface); }
        .section h3 { margin: 0 0 6px; font-size: 18px; }
        .cards, .slots { display: grid; gap: 12px; }
        .cards { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .card, .slot {
          border: 1px solid var(--calendra-border); background: white; border-radius: 20px;
          padding: 16px; cursor: pointer; transition: 150ms ease;
        }
        .card.active, .slot.active { border-color: var(--calendra-primary); background: color-mix(in srgb, var(--calendra-primary) 8%, white); }
        .card:hover, .slot:hover { transform: translateY(-1px); }
        .meta { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
        .price {
          background: color-mix(in srgb, var(--calendra-accent) 12%, white);
          color: var(--calendra-accent); border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 700;
        }
        label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        input, select {
          width: 100%; border: 1px solid var(--calendra-border); background: white; color: var(--calendra-text);
          border-radius: 16px; padding: 12px 14px; font: inherit;
        }
        .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .full { grid-column: 1 / -1; }
        .actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }
        button.primary, button.secondary {
          border: 0; border-radius: 999px; padding: 12px 18px; font: inherit; font-weight: 700; cursor: pointer;
        }
        button.primary { background: var(--calendra-primary); color: white; }
        button.secondary { background: transparent; color: var(--calendra-muted); border: 1px solid var(--calendra-border); }
        .error {
          padding: 12px 14px; border-radius: 16px; background: rgba(239, 68, 68, 0.08); color: #b91c1c; font-size: 14px;
        }
        .success {
          padding: 18px; border-radius: 20px; background: var(--calendra-success-bg); color: var(--calendra-success-text);
          font-size: 14px; line-height: 1.5;
        }
        .empty {
          border: 1px dashed var(--calendra-border); background: var(--calendra-surface-soft); border-radius: 18px; padding: 16px; color: var(--calendra-muted);
        }
        .loading { padding: 28px; color: var(--calendra-muted); }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .title { font-size: 24px; } }
      `;
    }

    render() {
      const { loading, error, config, services, selectedServiceId, selectedDate, slots, selectedSlot, form, saving, bookingSuccess } = this.state;
      this.shadowRoot.innerHTML = `
        <style>${this.styles()}</style>
        <div class="widget">
          <div class="header">
            <div class="badge">Calendra booking</div>
            <div class="title">Book your session</div>
            <div class="subtitle">Choose a service, date and time, then enter guest details.</div>
          </div>
          <div class="body">
            ${loading ? '<div class="loading">Loading booking widget…</div>' : ''}
            ${!loading && error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
            ${!loading && bookingSuccess ? `
              <div class="success">
                <strong>Booking confirmed.</strong><br />
                ${escapeHtml(bookingSuccess.serviceName || 'Session')} on ${escapeHtml(bookingSuccess.startsAtLabel || bookingSuccess.startTime || '')}.<br />
                Confirmation sent to ${escapeHtml(bookingSuccess.email || form.email)}.
              </div>
            ` : ''}
            ${!loading && config ? `
              <div class="section">
                <h3>1. Choose service</h3>
                <div class="cards">
                  ${services.map((service) => `
                    <button class="card ${selectedServiceId === service.id ? 'active' : ''}" data-action="service" data-id="${service.id}">
                      <div class="meta">
                        <div>
                          <div><strong>${escapeHtml(service.name)}</strong></div>
                          <div class="muted">${escapeHtml(String(service.durationMinutes || 60))} min</div>
                        </div>
                        ${service.priceLabel ? `<div class="price">${escapeHtml(service.priceLabel)}</div>` : ''}
                      </div>
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="section">
                <h3>2. Choose date and time</h3>
                <div class="grid">
                  <div>
                    <label for="booking-date">Date</label>
                    <input id="booking-date" type="date" min="${this.todayInWidgetTimezone()}" value="${escapeHtml(selectedDate || '')}" />
                  </div>
                  <div>
                    <label>${config.availabilityEnabled ? 'Available slots' : 'Time'}</label>
                    ${config.availabilityEnabled ? `
                      <div class="slots">
                        ${slots.length ? slots.map((slot) => `
                          <button class="slot ${selectedSlot?.startTime === slot.startTime && selectedSlot?.consultantId === slot.consultantId ? 'active' : ''}" data-action="slot" data-start="${escapeHtml(slot.startTime)}" data-consultant-id="${slot.consultantId}">
                            <strong>${escapeHtml(slot.label)}</strong>
                            ${slot.consultantName ? `<div class="muted">${escapeHtml(slot.consultantName)}</div>` : ''}
                          </button>
                        `).join('') : `<div class="empty">No available slots for this date.</div>`}
                      </div>
                    ` : `
                      <select id="manual-time">
                        <option value="">Choose a time</option>
                        ${this.manualTimeOptions(config).map((time) => `<option value="${time}">${time}</option>`).join('')}
                      </select>
                    `}
                  </div>
                </div>
              </div>

              <div class="section">
                <h3>3. Guest details</h3>
                <div class="grid">
                  <div>
                    <label for="first-name">First name</label>
                    <input id="first-name" type="text" value="${escapeHtml(form.firstName)}" />
                  </div>
                  <div>
                    <label for="last-name">Last name</label>
                    <input id="last-name" type="text" value="${escapeHtml(form.lastName)}" />
                  </div>
                  <div class="full">
                    <label for="email">Email</label>
                    <input id="email" type="email" value="${escapeHtml(form.email)}" />
                  </div>
                  <div class="full">
                    <label for="phone">Phone</label>
                    <input id="phone" type="tel" value="${escapeHtml(form.phone)}" />
                  </div>
                </div>
              </div>

              <div class="actions">
                <button class="secondary" type="button" data-action="refresh">Refresh availability</button>
                <button class="primary" type="button" data-action="submit" ${saving ? 'disabled' : ''}>${saving ? 'Booking…' : 'Book session'}</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      this.bindEvents();
    }

    manualTimeOptions(config) {
      const start = config?.workingHoursStart || '08:00';
      const end = config?.workingHoursEnd || '18:00';
      const items = [];
      let [hour, minute] = start.split(':').map(Number);
      const [endHour, endMinute] = end.split(':').map(Number);
      while (hour < endHour || (hour === endHour && minute <= endMinute)) {
        items.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        minute += 30;
        if (minute >= 60) {
          hour += 1;
          minute -= 60;
        }
      }
      return items;
    }

    bindEvents() {
      this.shadowRoot.querySelectorAll('[data-action="service"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.setState({ selectedServiceId: Number(button.dataset.id) });
          await this.loadAvailability();
        });
      });

      const dateInput = this.shadowRoot.getElementById('booking-date');
      if (dateInput) {
        dateInput.addEventListener('change', async (event) => {
          this.setState({ selectedDate: event.target.value });
          await this.loadAvailability();
        });
      }

      this.shadowRoot.querySelectorAll('[data-action="slot"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedSlot: {
              startTime: button.dataset.start,
              consultantId: Number(button.dataset.consultantId),
              label: button.textContent.trim(),
            },
          });
        });
      });

      ['first-name', 'last-name', 'email', 'phone'].forEach((id) => {
        const input = this.shadowRoot.getElementById(id);
        if (!input) return;
        input.addEventListener('input', (event) => {
          const fieldMap = { 'first-name': 'firstName', 'last-name': 'lastName', email: 'email', phone: 'phone' };
          this.updateForm(fieldMap[id], event.target.value);
        });
      });

      const refresh = this.shadowRoot.querySelector('[data-action="refresh"]');
      if (refresh) refresh.addEventListener('click', () => this.loadAvailability());
      const submit = this.shadowRoot.querySelector('[data-action="submit"]');
      if (submit) submit.addEventListener('click', () => this.submitBooking());
    }
  }

  if (!customElements.get('calendra-booking-widget')) {
    customElements.define('calendra-booking-widget', CalendraBookingWidget);
  }

  window.CalendraBookingWidget = {
    mount(selector, options) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Mount target not found: ${selector}`);
      const widget = document.createElement('calendra-booking-widget');
      Object.entries(options || {}).forEach(([key, value]) => {
        if (value == null) return;
        widget.setAttribute(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(value));
      });
      el.innerHTML = '';
      el.appendChild(widget);
      return widget;
    },
  };
})();
