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

  const TRANSLATIONS = {
    en: {
      badge: 'Calendra booking',
      title: 'Book your session',
      subtitle: 'Choose a service, consultant, date and time, then enter guest details.',
      loading: 'Loading booking widget…',
      confirmed: 'Booking confirmed.',
      confirmationSent: 'Confirmation sent to',
      sectionService: 'Choose service',
      sectionConsultant: 'Choose consultant',
      sectionDateTime: 'Choose date and time',
      sectionGuest: 'Guest details',
      labelDate: 'Date',
      labelSlots: 'Available slots',
      labelTime: 'Time',
      labelFirstName: 'First name',
      labelLastName: 'Last name',
      labelEmail: 'Email',
      labelPhone: 'Phone',
      consultantRequiredHint: 'Choose a consultant to see available slots.',
      noSlots: 'No available slots for this date.',
      noConsultants: 'No consultants available for this service.',
      chooseTime: 'Choose a time',
      refreshAvailability: 'Refresh availability',
      refreshSlots: 'Refresh slots',
      submit: 'Book session',
      submitting: 'Booking…',
      selectPlaceholder: 'Choose',
      completePrefix: 'Please complete:',
      chooseTimeError: 'Please choose a time.',
      failedToLoad: 'Failed to load booking widget.',
      failedToLoadAvailability: 'Failed to load availability.',
      failedToLoadConsultants: 'Failed to load consultants.',
      bookingFailed: 'Booking failed.',
      service: 'service',
      consultant: 'consultant',
      date: 'date',
      time: 'time',
      firstName: 'first name',
      lastName: 'last name',
      email: 'email',
      phone: 'phone',
      sessionFallback: 'Session',
    },
    sl: {
      badge: 'Naročanje',
      title: 'Rezervirajte termin',
      subtitle: 'Izberite storitev, svetovalca, datum in uro, nato vnesite podatke gosta.',
      loading: 'Nalagam booking widget…',
      confirmed: 'Rezervacija potrjena.',
      confirmationSent: 'Potrditev poslana na',
      sectionService: 'Izberite storitev',
      sectionConsultant: 'Izberite svetovalca',
      sectionDateTime: 'Izberite datum in uro',
      sectionGuest: 'Podatki gosta',
      labelDate: 'Datum',
      labelSlots: 'Razpoložljivi termini',
      labelTime: 'Ura',
      labelFirstName: 'Ime',
      labelLastName: 'Priimek',
      labelEmail: 'E-pošta',
      labelPhone: 'Telefon',
      consultantRequiredHint: 'Najprej izberite svetovalca za prikaz prostih terminov.',
      noSlots: 'Za izbrani datum ni prostih terminov.',
      noConsultants: 'Za to storitev ni razpoložljivih svetovalcev.',
      chooseTime: 'Izberite uro',
      refreshAvailability: 'Osveži razpoložljivost',
      refreshSlots: 'Osveži termine',
      submit: 'Potrdi rezervacijo',
      submitting: 'Rezerviram…',
      selectPlaceholder: 'Izberite',
      completePrefix: 'Izpolnite:',
      chooseTimeError: 'Izberite uro.',
      failedToLoad: 'Widgeta ni bilo mogoče naložiti.',
      failedToLoadAvailability: 'Razpoložljivosti ni bilo mogoče naložiti.',
      failedToLoadConsultants: 'Svetovalcev ni bilo mogoče naložiti.',
      bookingFailed: 'Rezervacija ni uspela.',
      service: 'storitev',
      consultant: 'svetovalec',
      date: 'datum',
      time: 'ura',
      firstName: 'ime',
      lastName: 'priimek',
      email: 'e-pošta',
      phone: 'telefon',
      sessionFallback: 'Termin',
    },
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const parseOptionalNumber = (value) => {
    if (value == null || value === '' || value === 'null' || value === 'undefined') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

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
        consultants: [],
        selectedServiceId: null,
        selectedConsultantId: null,
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
          error: this.normalizeError(error, this.text().failedToLoad),
        });
      });
    }

    attributeChangedCallback() {
      this.readOptions();
      this.render();
    }

    text() {
      return this.options.locale && this.options.locale.toLowerCase().startsWith('sl')
        ? TRANSLATIONS.sl
        : TRANSLATIONS.en;
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

      await this.loadConsultantsAndAvailability();
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

    async loadConsultantsAndAvailability() {
      await this.loadConsultants();
      await this.loadAvailability();
    }

    async loadConsultants() {
      if (!this.state.selectedServiceId) {
        this.setState({ consultants: [], selectedConsultantId: null, slots: [], selectedSlot: null });
        return;
      }

      try {
        const consultants = await this.fetchJson(
          `/api/public/widget/${encodeURIComponent(this.options.tenant)}/consultants?typeId=${encodeURIComponent(this.state.selectedServiceId)}`
        );
        const existingSelectionStillValid = consultants.some((consultant) => consultant.id === this.state.selectedConsultantId);
        const selectedConsultantId = consultants.length === 1
          ? consultants[0].id
          : existingSelectionStillValid
            ? this.state.selectedConsultantId
            : null;

        this.setState({
          consultants,
          selectedConsultantId,
          selectedSlot: null,
          error: '',
        });
      } catch (error) {
        this.setState({
          consultants: [],
          selectedConsultantId: null,
          slots: [],
          selectedSlot: null,
          error: this.normalizeError(error, this.text().failedToLoadConsultants),
        });
      }
    }

    async loadAvailability() {
      const { selectedServiceId, selectedDate, consultants, selectedConsultantId, config } = this.state;
      if (!selectedServiceId || !selectedDate) return;

      const consultantRequired = consultants.length > 1;
      if (consultantRequired && config?.availabilityEnabled && !selectedConsultantId) {
        this.setState({ slots: [], selectedSlot: null, error: '' });
        return;
      }

      this.setState({ error: '', slots: [], selectedSlot: null });
      try {
        const params = new URLSearchParams({
          typeId: String(selectedServiceId),
          date: selectedDate,
        });
        if (selectedConsultantId != null) {
          params.set('consultantId', String(selectedConsultantId));
        }
        const data = await this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/availability?${params.toString()}`);
        this.setState({ slots: data.slots || [] });
      } catch (error) {
        this.setState({ error: this.normalizeError(error, this.text().failedToLoadAvailability) });
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
      const { selectedServiceId, selectedConsultantId, selectedDate, selectedSlot, consultants, form, config } = this.state;
      const t = this.text();
      const missing = [];
      if (!selectedServiceId) missing.push(t.service);
      if (consultants.length > 1 && !selectedConsultantId) missing.push(t.consultant);
      if (!selectedDate) missing.push(t.date);
      if (config?.availabilityEnabled && !selectedSlot) missing.push(t.time);
      if (!form.firstName.trim()) missing.push(t.firstName);
      if (!form.lastName.trim()) missing.push(t.lastName);
      if (!form.email.trim()) missing.push(t.email);
      if (!form.phone.trim()) missing.push(t.phone);

      if (missing.length) {
        this.setState({ error: `${t.completePrefix} ${missing.join(', ')}.` });
        return;
      }

      const fallbackTime = this.shadowRoot.getElementById('manual-time')?.value || '';
      if (!config?.availabilityEnabled && !fallbackTime) {
        this.setState({ error: t.chooseTimeError });
        return;
      }

      this.setState({ saving: true, error: '' });
      try {
        const payload = {
          typeId: selectedServiceId,
          date: selectedDate,
          startTime: config?.availabilityEnabled ? selectedSlot.startTime : `${selectedDate}T${fallbackTime}:00`,
          consultantId: config?.availabilityEnabled ? (selectedSlot?.consultantId ?? selectedConsultantId) : selectedConsultantId,
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
        this.setState({ saving: false, error: this.normalizeError(error, t.bookingFailed) });
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
          --calendra-primary-strong: color-mix(in srgb, var(--calendra-primary) 82%, black);
          --calendra-success-bg: rgba(22, 163, 74, 0.08);
          --calendra-success-text: #166534;
          display: block;
          color: var(--calendra-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        * { box-sizing: border-box; }
        .widget {
          background: var(--calendra-surface);
          border: 1px solid var(--calendra-border);
          border-radius: 28px;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.06);
        }
        .header {
          padding: 28px 30px 26px;
          border-bottom: 1px solid var(--calendra-border);
        }
        .badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: color-mix(in srgb, var(--calendra-primary) 9%, white);
          color: var(--calendra-text); border-radius: 999px;
          padding: 9px 14px; font-size: 13px; font-weight: 700;
        }
        .title {
          margin-top: 18px; font-size: 28px; line-height: 1.1; font-weight: 800;
          color: var(--calendra-text);
        }
        .subtitle {
          margin-top: 12px; color: var(--calendra-muted); font-size: 14px; line-height: 1.55;
        }
        .body { padding: 28px 30px 30px; display: grid; gap: 22px; }
        .section { display: grid; gap: 14px; }
        .section h3 { margin: 0; font-size: 16px; font-weight: 800; color: var(--calendra-text); }
        .cards { display: grid; gap: 12px; }
        .card, .slot {
          width: 100%; border: 1px solid var(--calendra-border); background: white; color: inherit;
          border-radius: 22px; padding: 18px 20px; text-align: left; cursor: pointer; transition: 150ms ease;
        }
        .card:hover, .slot:hover { border-color: color-mix(in srgb, var(--calendra-primary) 35%, var(--calendra-border)); }
        .card.active, .slot.active {
          border-color: color-mix(in srgb, var(--calendra-primary) 70%, white);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--calendra-primary) 10%, white);
        }
        .meta { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
        .muted { color: var(--calendra-muted); font-size: 14px; }
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
        button.primary[disabled], button.secondary[disabled] { opacity: 0.65; cursor: default; }
        button.primary { background: var(--calendra-primary-strong); color: white; }
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
        @media (max-width: 640px) {
          .grid { grid-template-columns: 1fr; }
          .title { font-size: 24px; }
          .actions { flex-direction: column; }
          button.primary, button.secondary { width: 100%; }
        }
      `;
    }

    render() {
      const {
        loading,
        error,
        config,
        services,
        consultants,
        selectedServiceId,
        selectedConsultantId,
        selectedDate,
        slots,
        selectedSlot,
        form,
        saving,
        bookingSuccess,
      } = this.state;
      const t = this.text();
      const showConsultantStep = consultants.length > 1;
      const dateStep = showConsultantStep ? 3 : 2;
      const guestStep = showConsultantStep ? 4 : 3;

      this.shadowRoot.innerHTML = `
        <style>${this.styles()}</style>
        <div class="widget">
          <div class="header">
            <div class="badge">${escapeHtml(t.badge)}</div>
            <div class="title">${escapeHtml(t.title)}</div>
            <div class="subtitle">${escapeHtml(t.subtitle)}</div>
          </div>
          <div class="body">
            ${loading ? `<div class="loading">${escapeHtml(t.loading)}</div>` : ''}
            ${!loading && error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
            ${!loading && bookingSuccess ? `
              <div class="success">
                <strong>${escapeHtml(t.confirmed)}</strong><br />
                ${escapeHtml(bookingSuccess.serviceName || t.sessionFallback)} on ${escapeHtml(bookingSuccess.startsAtLabel || bookingSuccess.startTime || '')}.<br />
                ${escapeHtml(t.confirmationSent)} ${escapeHtml(bookingSuccess.email || form.email)}.
              </div>
            ` : ''}
            ${!loading && config ? `
              <div class="section">
                <h3>1. ${escapeHtml(t.sectionService)}</h3>
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

              ${showConsultantStep ? `
                <div class="section">
                  <h3>2. ${escapeHtml(t.sectionConsultant)}</h3>
                  <div class="cards">
                    ${consultants.length ? consultants.map((consultant) => `
                      <button class="card ${selectedConsultantId === consultant.id ? 'active' : ''}" data-action="consultant" data-id="${consultant.id}">
                        <div><strong>${escapeHtml(consultant.name)}</strong></div>
                      </button>
                    `).join('') : `<div class="empty">${escapeHtml(t.noConsultants)}</div>`}
                  </div>
                </div>
              ` : ''}

              <div class="section">
                <h3>${dateStep}. ${escapeHtml(t.sectionDateTime)}</h3>
                <div class="grid">
                  <div>
                    <label for="booking-date">${escapeHtml(t.labelDate)}</label>
                    <input id="booking-date" type="date" min="${this.todayInWidgetTimezone()}" value="${escapeHtml(selectedDate || '')}" />
                  </div>
                  <div>
                    <label>${escapeHtml(config.availabilityEnabled ? t.labelSlots : t.labelTime)}</label>
                    ${config.availabilityEnabled ? `
                      <div class="slots">
                        ${showConsultantStep && !selectedConsultantId
                          ? `<div class="empty">${escapeHtml(t.consultantRequiredHint)}</div>`
                          : slots.length
                            ? slots.map((slot) => `
                              <button class="slot ${selectedSlot?.startTime === slot.startTime && selectedSlot?.consultantId === slot.consultantId ? 'active' : ''}" data-action="slot" data-start="${escapeHtml(slot.startTime)}" data-consultant-id="${slot.consultantId == null ? '' : slot.consultantId}">
                                <strong>${escapeHtml(slot.label)}</strong>
                                ${showConsultantStep || !slot.consultantName ? '' : `<div class="muted">${escapeHtml(slot.consultantName)}</div>`}
                              </button>
                            `).join('')
                            : `<div class="empty">${escapeHtml(t.noSlots)}</div>`}
                      </div>
                    ` : `
                      <select id="manual-time">
                        <option value="">${escapeHtml(t.chooseTime)}</option>
                        ${this.manualTimeOptions(config).map((time) => `<option value="${time}">${time}</option>`).join('')}
                      </select>
                    `}
                  </div>
                </div>
              </div>

              <div class="section">
                <h3>${guestStep}. ${escapeHtml(t.sectionGuest)}</h3>
                <div class="grid">
                  <div>
                    <label for="first-name">${escapeHtml(t.labelFirstName)}</label>
                    <input id="first-name" type="text" value="${escapeHtml(form.firstName)}" />
                  </div>
                  <div>
                    <label for="last-name">${escapeHtml(t.labelLastName)}</label>
                    <input id="last-name" type="text" value="${escapeHtml(form.lastName)}" />
                  </div>
                  <div class="full">
                    <label for="email">${escapeHtml(t.labelEmail)}</label>
                    <input id="email" type="email" value="${escapeHtml(form.email)}" />
                  </div>
                  <div class="full">
                    <label for="phone">${escapeHtml(t.labelPhone)}</label>
                    <input id="phone" type="tel" value="${escapeHtml(form.phone)}" />
                  </div>
                </div>
              </div>

              <div class="actions">
                <button class="secondary" type="button" data-action="refresh">${escapeHtml(config.availabilityEnabled ? t.refreshAvailability : t.refreshSlots)}</button>
                <button class="primary" type="button" data-action="submit" ${saving ? 'disabled' : ''}>${escapeHtml(saving ? t.submitting : t.submit)}</button>
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
          this.setState({
            selectedServiceId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
          });
          await this.loadConsultantsAndAvailability();
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="consultant"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.setState({
            selectedConsultantId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
          });
          await this.loadAvailability();
        });
      });

      const dateInput = this.shadowRoot.getElementById('booking-date');
      if (dateInput) {
        dateInput.addEventListener('change', async (event) => {
          this.setState({ selectedDate: event.target.value, bookingSuccess: null });
          await this.loadAvailability();
        });
      }

      this.shadowRoot.querySelectorAll('[data-action="slot"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedSlot: {
              startTime: button.dataset.start,
              consultantId: parseOptionalNumber(button.dataset.consultantId),
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
