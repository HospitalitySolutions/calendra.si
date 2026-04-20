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
      subtitle: 'A faster multi-step booking flow for service, consultant, time, and guest details.',
      loading: 'Loading booking widget…',
      loadingAvailability: 'Loading available times…',
      confirmed: 'Booking confirmed.',
      confirmationSent: 'Confirmation sent to',
      sectionService: 'Choose service',
      sectionConsultant: 'Choose employee',
      sectionDateTime: 'Choose date and time',
      sectionGuest: 'Payment & review',
      stepService: 'Service',
      stepConsultant: 'Employee',
      stepDateTime: 'Date & time',
      stepGuest: 'Payment & review',
      paymentMethodTitle: 'Payment method',
      paymentMethodCard: 'Credit / Debit card',
      paymentMethodCardSubtitle: 'Pay securely by card.',
      paymentMethodBank: 'Bank transfer',
      paymentMethodBankSubtitle: 'Reserve now, pay via bank transfer with QR code.',
      paymentMethodPaypal: 'PayPal',
      paymentMethodPaypalSubtitle: 'Redirect to PayPal to approve the payment.',
      paymentMethodsNone: 'No online payment methods are available for this tenant.',
      bankTransferTitle: 'Bank transfer instructions',
      bankTransferAmount: 'Amount',
      bankTransferReference: 'Reference',
      paypalRedirecting: 'Redirecting to PayPal…',
      payment: 'payment method',
      summaryTitle: 'Your booking',
      summaryEmpty: 'Choose a service to begin.',
      summaryPrivacyTitle: 'Your booking is private and secure.',
      summaryPrivacyText: 'You can reschedule up to 24 hours before the appointment.',
      labelDate: 'Date',
      labelSlots: 'Available slots',
      labelTime: 'Time',
      labelFirstName: 'First name',
      labelLastName: 'Last name',
      labelEmail: 'Email',
      labelPhone: 'Phone',
      firstNamePlaceholder: 'First name',
      lastNamePlaceholder: 'Last name',
      emailPlaceholder: 'name@example.com',
      phonePlaceholder: 'Phone number',
      consultantRequiredHint: 'Choose a consultant to see available slots.',
      noSlots: 'No available slots for this date.',
      verificationRequired: 'Please complete the verification challenge.',
      noConsultants: 'No consultants available for this service.',
      chooseTime: 'Choose a time',
      refreshAvailability: 'Refresh availability',
      refreshSlots: 'Refresh slots',
      submit: 'Confirm booking',
      submitting: 'Booking…',
      continue: 'Continue',
      back: 'Back',
      bookAnother: 'Book another session',
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
      selected: 'Selected',
      monthPrev: 'Previous month',
      monthNext: 'Next month',
      weekdayShort: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      durationSuffix: 'min',
      optionalConsultant: 'Assigned automatically',
      groupSessionsTitle: 'Open group sessions',
      groupSessionsSubtitle: 'Choose one of the existing group booking time slots for this service.',
      groupSessionAvailable: 'Open session',
      groupSessionSpotsLeft: 'spots left',
      groupSessionBooked: 'booked',
      groupSessionNoOptions: 'No open group sessions for this date.',
      groupSessionSelectionHint: 'Group bookings use the consultant already assigned to the selected group session, or a consultant can be assigned later.',
    },
    sl: {
      badge: 'Naročanje',
      title: 'Rezervirajte termin',
      subtitle: 'Hitrejši večstopenjski potek za izbiro storitve, svetovalca, termina in podatkov gosta.',
      loading: 'Nalagam booking widget…',
      loadingAvailability: 'Nalagam razpoložljive termine…',
      confirmed: 'Rezervacija potrjena.',
      confirmationSent: 'Potrditev poslana na',
      sectionService: 'Izberite storitev',
      sectionConsultant: 'Izberite zaposlenega',
      sectionDateTime: 'Izberite datum in uro',
      sectionGuest: 'Plačilo in pregled',
      stepService: 'Storitev',
      stepConsultant: 'Zaposleni',
      stepDateTime: 'Datum in ura',
      stepGuest: 'Plačilo in pregled',
      paymentMethodTitle: 'Način plačila',
      paymentMethodCard: 'Kreditna / debetna kartica',
      paymentMethodCardSubtitle: 'Varno plačilo s kartico.',
      paymentMethodBank: 'Bančno nakazilo',
      paymentMethodBankSubtitle: 'Rezervirajte zdaj, plačajte prek bančnega nakazila s QR kodo.',
      paymentMethodPaypal: 'PayPal',
      paymentMethodPaypalSubtitle: 'Preusmeritev na PayPal za potrditev plačila.',
      paymentMethodsNone: 'Za to tenancy ni na voljo spletnih načinov plačila.',
      bankTransferTitle: 'Navodila za bančno nakazilo',
      bankTransferAmount: 'Znesek',
      bankTransferReference: 'Sklic',
      paypalRedirecting: 'Preusmerjanje na PayPal…',
      payment: 'način plačila',
      summaryTitle: 'Vaša rezervacija',
      summaryEmpty: 'Za začetek izberite storitev.',
      summaryPrivacyTitle: 'Vaša rezervacija je zasebna in varna.',
      summaryPrivacyText: 'Termin lahko prestavite do 24 ur pred rezervacijo.',
      labelDate: 'Datum',
      labelSlots: 'Razpoložljivi termini',
      labelTime: 'Ura',
      labelFirstName: 'Ime',
      labelLastName: 'Priimek',
      labelEmail: 'E-pošta',
      labelPhone: 'Telefon',
      firstNamePlaceholder: 'Ime',
      lastNamePlaceholder: 'Priimek',
      emailPlaceholder: 'npr. ime@email.si',
      phonePlaceholder: 'Telefonska številka',
      consultantRequiredHint: 'Najprej izberite svetovalca za prikaz prostih terminov.',
      noSlots: 'Za izbrani datum ni prostih terminov.',
      verificationRequired: 'Izpolnite varnostni preveritveni izziv.',
      noConsultants: 'Za to storitev ni razpoložljivih svetovalcev.',
      chooseTime: 'Izberite uro',
      refreshAvailability: 'Osveži razpoložljivost',
      refreshSlots: 'Osveži termine',
      submit: 'Potrdi rezervacijo',
      submitting: 'Rezerviram…',
      continue: 'Naprej',
      back: 'Nazaj',
      bookAnother: 'Rezerviraj nov termin',
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
      selected: 'Izbrano',
      monthPrev: 'Prejšnji mesec',
      monthNext: 'Naslednji mesec',
      weekdayShort: ['Po', 'To', 'Sr', 'Če', 'Pe', 'So', 'Ne'],
      durationSuffix: 'min',
      optionalConsultant: 'Dodeli se samodejno',
      groupSessionsTitle: 'Odprte skupinske ure',
      groupSessionsSubtitle: 'Izberite enega od obstoječih skupinskih terminov za to storitev.',
      groupSessionAvailable: 'Odprta ura',
      groupSessionSpotsLeft: 'prostih mest',
      groupSessionBooked: 'prijavljenih',
      groupSessionNoOptions: 'Za ta datum ni odprtih skupinskih ur.',
      groupSessionSelectionHint: 'Za skupinske rezervacije se uporabi že dodeljeni svetovalec izbranega skupinskega termina, lahko pa se svetovalec določi tudi pozneje.',
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

  const parseIsoDate = (value) => {
    if (!value || typeof value !== 'string') return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  };

  const formatIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const firstOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const addMonths = (date, offset) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

  const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

  class CalendraBookingWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.state = {
        loading: true,
        saving: false,
        loadingAvailability: false,
        error: '',
        config: null,
        services: [],
        consultants: [],
        selectedServiceId: null,
        selectedConsultantId: null,
        selectedDate: '',
        calendarMonth: '',
        slots: [],
        groupSessions: [],
        selectedSlot: null,
        selectedGroupSession: null,
        manualTime: '',
        activeStep: 'service',
        form: { firstName: '', lastName: '', email: '', phone: '' },
        bookingSuccess: null,
        turnstileToken: '',
        turnstileWidgetId: null,
        turnstileRenderedSiteKey: null,
        paymentMethod: null,
        paymentResult: null,
      };
      this.options = { ...DEFAULTS };
      this.resizeObserver = null;
      this.handleWindowResize = null;
      this.turnstileRenderScheduled = false;
      this.turnstileRendering = false;
      this.ensureTurnstileScript = this.ensureTurnstileScript.bind(this);
    }

    static get observedAttributes() {
      return ['tenant', 'base-url', 'locale', 'primary-color', 'accent-color'];
    }

    connectedCallback() {
      this.readOptions();
      this.observeLayout();
      this.render();
      this.bootstrap().catch((error) => {
        this.setState({
          loading: false,
          error: this.normalizeError(error, this.text().failedToLoad),
        });
      });
    }

    disconnectedCallback() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.handleWindowResize) {
        window.removeEventListener('resize', this.handleWindowResize);
        this.handleWindowResize = null;
      }
    }

    attributeChangedCallback() {
      this.readOptions();
      this.render();
    }

    text() {
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase();
      return locale.startsWith('sl') ? TRANSLATIONS.sl : TRANSLATIONS.en;
    }

    shouldRenderTurnstile() {
      return Boolean(
        this.state?.activeStep === 'details' &&
        this.state?.config?.turnstileEnabled &&
        this.state?.config?.turnstileSiteKey
      );
    }

    observeLayout() {
      const update = () => {
        const width = this.getBoundingClientRect().width || this.clientWidth || window.innerWidth || 0;
        this.applyLayoutMode(width);
      };

      update();

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          const width = entry?.contentRect?.width || this.getBoundingClientRect().width || this.clientWidth || window.innerWidth || 0;
          this.applyLayoutMode(width);
        });
        this.resizeObserver.observe(this);
        return;
      }

      this.handleWindowResize = update;
      window.addEventListener('resize', this.handleWindowResize);
    }

    applyLayoutMode(width) {
      const next = width <= 480
        ? 'micro'
        : width <= 680
          ? 'narrow'
          : width <= 960
            ? 'compact'
            : 'wide';

      if (this.getAttribute('data-layout') !== next) {
        this.setAttribute('data-layout', next);
      }
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
        calendarMonth: this.monthKeyForDate(selectedDate),
        activeStep: 'service',
      });

      await this.loadConsultantsAndAvailability();
      if (this.state.config?.turnstileEnabled && this.state.config?.turnstileSiteKey) {
        await this.ensureTurnstileScript();
      }
    }

    todayInWidgetTimezone() {
      const now = new Date();
      return formatIsoDate(now);
    }

    monthKeyForDate(value) {
      const date = parseIsoDate(value) || new Date();
      return formatIsoDate(firstOfMonth(date));
    }

    stepDefinitions() {
      const t = this.text();
      const showConsultantStep = this.shouldShowConsultantStep();
      return [
        { id: 'service', label: t.stepService },
        ...(showConsultantStep ? [{ id: 'consultant', label: t.stepConsultant }] : []),
        { id: 'datetime', label: t.stepDateTime },
        { id: 'details', label: t.stepGuest },
      ];
    }

    shouldShowConsultantStep() {
      if (this.currentServiceSupportsGroupSessions()) return false;
      // Tenant-level override: when the "Employee selection step" setting is ON in
      // Configuration -> Guest app, always show the employee step; when OFF, never show it.
      return Boolean(this.state.config?.employeeSelectionStep);
    }

    ensureValidActiveStep(nextState) {
      const steps = this.stepDefinitions();
      const activeStep = nextState?.activeStep || this.state.activeStep;
      if (steps.some((step) => step.id === activeStep)) return activeStep;
      return steps[0]?.id || 'service';
    }

    activeStepIndex() {
      const steps = this.stepDefinitions();
      return Math.max(0, steps.findIndex((step) => step.id === this.state.activeStep));
    }

    goToNextStep() {
      const steps = this.stepDefinitions();
      const index = this.activeStepIndex();
      const next = steps[index + 1];
      if (!next) return;

      this.setState({ activeStep: next.id, error: '' });

      if (next.id === 'details') {
        this.scheduleTurnstileMount();
      }
    }

    goToPreviousStep() {
      const steps = this.stepDefinitions();
      const index = this.activeStepIndex();
      const previous = steps[index - 1];
      if (!previous) return;

      if (this.state.activeStep === 'details') {
        this.resetTurnstile();
      }

      this.setState({ activeStep: previous.id, error: '' });
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
        this.setState({ consultants: [], selectedConsultantId: null, slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, activeStep: 'service' });
        return;
      }

      if (this.currentServiceSupportsGroupSessions()) {
        const nextActiveStep = this.state.activeStep === 'consultant' ? 'datetime' : this.state.activeStep;
        this.setState({
          consultants: [],
          selectedConsultantId: null,
          selectedSlot: null,
          selectedGroupSession: null,
          groupSessions: [],
          manualTime: '',
          error: '',
          activeStep: nextActiveStep,
        });
        return;
      }

      try {
        const consultants = await this.fetchJson(
          `/api/public/widget/${encodeURIComponent(this.options.tenant)}/consultants?typeId=${encodeURIComponent(this.state.selectedServiceId)}`
        );
        const existingSelectionStillValid = consultants.some((consultant) => consultant.id === this.state.selectedConsultantId);
        // Don't auto-pick when the tenant-level step is ON: the user must actively confirm an employee.
        const selectedConsultantId = !this.shouldShowConsultantStep() && consultants.length === 1
          ? consultants[0].id
          : existingSelectionStillValid
            ? this.state.selectedConsultantId
            : null;

        const nextActiveStep = this.state.activeStep === 'consultant' && !this.shouldShowConsultantStep()
          ? 'datetime'
          : this.state.activeStep;

        this.setState({
          consultants,
          selectedConsultantId,
          selectedSlot: null,
          selectedGroupSession: null,
          groupSessions: [],
          manualTime: '',
          error: '',
          activeStep: nextActiveStep,
        });
      } catch (error) {
        this.setState({
          consultants: [],
          selectedConsultantId: null,
          slots: [],
          groupSessions: [],
          selectedSlot: null,
          selectedGroupSession: null,
          manualTime: '',
          error: this.normalizeError(error, this.text().failedToLoadConsultants),
        });
      }
    }

    async loadAvailability() {
      const { selectedServiceId, selectedDate, consultants, selectedConsultantId, config } = this.state;
      if (!selectedServiceId || !selectedDate) return;

      const supportsGroupSessions = this.currentServiceSupportsGroupSessions();
      // When the employee-selection step is on we wait for the user to pick a consultant
      // before loading slots; without the step we show merged slots for all consultants.
      const consultantRequiredForRegularSlots = !supportsGroupSessions
        && this.shouldShowConsultantStep()
        && config?.availabilityEnabled
        && !selectedConsultantId;

      if (!config?.availabilityEnabled && !supportsGroupSessions) {
        this.setState({ slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, loadingAvailability: false, error: '' });
        return;
      }

      this.setState({ error: '', slots: [], groupSessions: [], selectedSlot: null, selectedGroupSession: null, loadingAvailability: true });
      try {
        const params = new URLSearchParams({
          typeId: String(selectedServiceId),
          date: selectedDate,
        });
        if (selectedConsultantId != null) {
          params.set('consultantId', String(selectedConsultantId));
        }
        const data = await this.fetchJson(`/api/public/widget/${encodeURIComponent(this.options.tenant)}/availability?${params.toString()}`);
        this.setState({
          slots: supportsGroupSessions ? [] : (consultantRequiredForRegularSlots ? [] : (data.slots || [])),
          groupSessions: data.groupSessions || [],
          loadingAvailability: false,
        });
      } catch (error) {
        this.setState({ loadingAvailability: false, error: this.normalizeError(error, this.text().failedToLoadAvailability) });
      }
    }

    setState(patch) {
      const previousSiteKey = this.state?.config?.turnstileSiteKey || null;
      const previousActiveStep = this.state?.activeStep;

      this.state = { ...this.state, ...patch };
      this.state.activeStep = this.ensureValidActiveStep(this.state);

      const nextSiteKey = this.state?.config?.turnstileSiteKey || null;
      if ((previousSiteKey && previousSiteKey !== nextSiteKey) || (previousActiveStep === 'details' && this.state.activeStep !== 'details')) {
        this.resetTurnstile();
      }

      this.render();
    }

    normalizeError(error, fallback) {
      return error instanceof Error ? error.message : fallback;
    }

    updateForm(field, value) {
      this.state.form = { ...this.state.form, [field]: value };
    }

    currentService() {
      return this.state.services.find((item) => item.id === this.state.selectedServiceId) || null;
    }

    currentConsultant() {
      return this.state.consultants.find((item) => item.id === this.state.selectedConsultantId) || null;
    }

    currentSummaryConsultant() {
      if (this.state.selectedGroupSession?.consultantName) {
        return {
          name: this.state.selectedGroupSession.consultantName,
        };
      }
      return this.currentConsultant();
    }

    currentServiceSupportsGroupSessions() {
      const maxParticipants = this.currentService()?.maxParticipantsPerSession;
      return maxParticipants != null && maxParticipants !== '';
    }

    consultantSelectionOptional() {
      return this.currentServiceSupportsGroupSessions();
    }

    selectedTimeLabel() {
      if (this.state.selectedGroupSession) {
        return this.state.selectedGroupSession.label || '';
      }
      if (this.state.config?.availabilityEnabled) {
        return this.state.selectedSlot?.label || '';
      }
      return this.state.manualTime || '';
    }

    isStepComplete(stepId) {
      const { form } = this.state;
      if (stepId === 'service') return Boolean(this.state.selectedServiceId);
      if (stepId === 'consultant') return !this.shouldShowConsultantStep() || this.consultantSelectionOptional() || Boolean(this.state.selectedConsultantId);
      if (stepId === 'datetime') {
        if (!this.state.selectedDate) return false;
        if (this.state.selectedGroupSession) return true;
        return this.state.config?.availabilityEnabled ? Boolean(this.state.selectedSlot) : Boolean(this.state.manualTime);
      }
      if (stepId === 'details') {
        const hasGuestDetails = Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim());
        const hasPayment = Boolean(this.state.paymentMethod) && this.isPaymentMethodAvailable(this.state.paymentMethod);
        return hasGuestDetails && hasPayment;
      }
      return false;
    }

    allowedPaymentMethods() {
      return this.state.config?.allowedPaymentMethods || { card: false, bankTransfer: false, paypal: false };
    }

    isPaymentMethodAvailable(method) {
      const allowed = this.allowedPaymentMethods();
      if (method === 'CARD') return Boolean(allowed.card);
      if (method === 'BANK_TRANSFER') return Boolean(allowed.bankTransfer);
      if (method === 'PAYPAL') return Boolean(allowed.paypal);
      return false;
    }

    initials(name) {
      const safe = String(name || '').trim();
      if (!safe) return '•';
      return safe.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
    }

    validateCurrentStep() {
      const t = this.text();
      const missing = [];

      if (this.state.activeStep === 'service' && !this.state.selectedServiceId) missing.push(t.service);
      if (this.state.activeStep === 'consultant' && this.shouldShowConsultantStep() && !this.consultantSelectionOptional() && !this.state.selectedConsultantId) missing.push(t.consultant);

      if (this.state.activeStep === 'datetime') {
        if (!this.state.selectedDate) missing.push(t.date);
        if (!this.state.selectedGroupSession) {
          if (this.state.config?.availabilityEnabled && !this.state.selectedSlot) missing.push(t.time);
          if (!this.state.config?.availabilityEnabled && !this.state.manualTime) missing.push(t.time);
        }
      }

      if (this.state.activeStep === 'details') {
        if (!this.state.form.firstName.trim()) missing.push(t.firstName);
        if (!this.state.form.lastName.trim()) missing.push(t.lastName);
        if (!this.state.form.email.trim()) missing.push(t.email);
        if (!this.state.form.phone.trim()) missing.push(t.phone);
        if (!this.state.paymentMethod || !this.isPaymentMethodAvailable(this.state.paymentMethod)) missing.push(t.payment);

        if (this.state.config?.turnstileEnabled && !this.state.turnstileToken) {
          missing.push(t.verificationRequired);
        }
      }

      if (missing.length) {
        this.setState({ error: `${t.completePrefix} ${missing.join(', ')}.` });
        return false;
      }

      this.setState({ error: '' });
      return true;
    }

    async ensureTurnstileScript() {
      if (window.turnstile) return window.turnstile;

      if (window.__calendraTurnstilePromise) {
        return window.__calendraTurnstilePromise;
      }

      window.__calendraTurnstilePromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-calendra-turnstile]');
        if (existing) {
          const waitForTurnstile = () => {
            if (window.turnstile) resolve(window.turnstile);
            else setTimeout(waitForTurnstile, 50);
          };
          waitForTurnstile();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.calendraTurnstile = 'true';

        script.onload = () => {
          const waitForTurnstile = () => {
            if (window.turnstile) resolve(window.turnstile);
            else setTimeout(waitForTurnstile, 50);
          };
          waitForTurnstile();
        };

        script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile script.'));
        document.head.appendChild(script);
      });

      return window.__calendraTurnstilePromise;
    }

    ensureLightDomTurnstileHost() {
      let host = this.querySelector('[slot="turnstile-slot"]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('slot', 'turnstile-slot');
        host.className = 'calendra-turnstile-light-dom-host';
        this.appendChild(host);
      }

      host.style.display = 'block';
      host.style.width = '100%';
      host.style.minHeight = '65px';
      host.style.overflow = 'hidden';

      return host;
    }

    removeLightDomTurnstileHost() {
      const host = this.querySelector('[slot="turnstile-slot"]');
      if (host) host.remove();
    }

    resetTurnstile() {
      this.turnstileRenderScheduled = false;
      this.turnstileRendering = false;

      if (this.state.turnstileWidgetId != null && window.turnstile) {
        try {
          window.turnstile.remove(this.state.turnstileWidgetId);
        } catch (_) {}
      }

      const host = this.querySelector('[slot="turnstile-slot"]');
      if (host) host.innerHTML = '';

      this.state.turnstileWidgetId = null;
      this.state.turnstileToken = '';
      this.state.turnstileRenderedSiteKey = null;
    }

    scheduleTurnstileMount() {
      if (!this.shouldRenderTurnstile()) return;
      if (this.state.turnstileWidgetId != null) return;
      if (this.turnstileRenderScheduled || this.turnstileRendering) return;

      this.turnstileRenderScheduled = true;
      requestAnimationFrame(() => {
        this.turnstileRenderScheduled = false;
        this.mountTurnstileOnce();
      });
    }

    async mountTurnstileOnce() {
      if (!this.shouldRenderTurnstile()) return;
      if (this.state.turnstileWidgetId != null) return;
      if (this.turnstileRendering) return;

      this.turnstileRendering = true;
      try {
        await this.renderTurnstileWidget();
      } catch (error) {
        console.error('Turnstile render failed', error);
        this.setState({
          turnstileToken: '',
          error: this.normalizeError(error, 'Verification widget failed to load.'),
        });
      } finally {
        this.turnstileRendering = false;
      }
    }

    async renderTurnstileWidget() {
      if (!this.shouldRenderTurnstile()) {
        this.resetTurnstile();
        this.removeLightDomTurnstileHost();
        return;
      }

      if (this.state.turnstileWidgetId != null) return;

      const config = this.state.config;
      const host = this.ensureLightDomTurnstileHost();
      if (!host) throw new Error('Turnstile light DOM host could not be created.');

      await this.ensureTurnstileScript();
      if (!window.turnstile) throw new Error('Cloudflare Turnstile script loaded, but window.turnstile is unavailable.');

      host.innerHTML = '';

      const widgetId = window.turnstile.render(host, {
        sitekey: config.turnstileSiteKey,
        theme: 'auto',
        appearance: 'always',
        callback: (token) => {
          this.setState({
            turnstileToken: token || '',
            error: '',
          });
        },
        'expired-callback': () => {
          console.warn('Turnstile token expired');
          this.resetTurnstile();
          this.setState({ turnstileToken: '', error: 'Verification expired. Please complete it again.' });
          this.scheduleTurnstileMount();
        },
        'error-callback': (code) => {
          console.error('Turnstile error', code);
          this.resetTurnstile();
          this.setState({ turnstileToken: '', error: `Verification widget error: ${code || 'unknown'}` });
          this.scheduleTurnstileMount();
        },
      });

      this.state.turnstileWidgetId = widgetId;
      this.state.turnstileRenderedSiteKey = config.turnstileSiteKey;
    }

    async submitBooking() {
      if (!this.validateCurrentStep()) return;

      const { selectedServiceId, selectedDate, selectedSlot, selectedConsultantId, form, config, paymentMethod } = this.state;
      const t = this.text();

      // Slot is required — the full flow is only intended for slot-based availability.
      if (!config?.availabilityEnabled || !selectedSlot) {
        this.setState({ error: `${t.completePrefix} ${t.time}.`, activeStep: 'datetime' });
        return;
      }
      if (!selectedDate) {
        this.setState({ error: `${t.completePrefix} ${t.date}.`, activeStep: 'datetime' });
        return;
      }

      this.setState({ saving: true, error: '' });

      try {
        const tenant = encodeURIComponent(this.options.tenant);

        // Step A: exchange first/last/email/phone + Turnstile token for a short-lived guest JWT.
        const session = await this.fetchJson(`/api/public/widget/${tenant}/guest-session`, {
          method: 'POST',
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            turnstileToken: this.state.turnstileToken || null,
          },
        });

        if (!session?.token) {
          throw new Error(t.bookingFailed || 'Booking failed.');
        }

        const authHeaders = { Authorization: `Bearer ${session.token}` };

        // Step B: create the order. The consultant is encoded into the slotId by the backend.
        // We still include selectedConsultantId when the employee step is used so the slot can be
        // resolved unambiguously for single-consultant tenants.
        const slotId = selectedSlot.slotId || selectedSlot.id;
        if (!slotId) {
          throw new Error('Slot identifier missing.');
        }

        const productId = `session-${selectedServiceId}`;

        const createResponse = await this.fetchJson(`/api/public/widget/${tenant}/orders`, {
          method: 'POST',
          headers: authHeaders,
          body: {
            companyId: session.companyId || '',
            productId,
            slotId,
            paymentMethodType: paymentMethod,
          },
        });

        const orderId = createResponse?.order?.orderId;
        if (!orderId) {
          throw new Error(t.bookingFailed || 'Booking failed.');
        }

        // Step C: checkout according to the selected payment method.
        const checkout = await this.fetchJson(`/api/public/widget/${tenant}/orders/${encodeURIComponent(orderId)}/checkout`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Idempotency-Key': (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)),
          },
          body: { paymentMethodType: paymentMethod },
        });

        // PayPal: redirect the user to the PayPal approval URL (returned as `checkoutUrl`).
        if (paymentMethod === 'PAYPAL' && checkout?.checkoutUrl) {
          this.setState({ saving: false, paymentResult: { type: 'PAYPAL', approveUrl: checkout.checkoutUrl } });
          window.location.href = checkout.checkoutUrl;
          return;
        }

        this.setState({
          saving: false,
          bookingSuccess: {
            id: orderId,
            serviceName: this.currentService()?.name,
            startsAtLabel: selectedSlot.label,
            startTime: selectedSlot.startTime,
            email: form.email.trim(),
          },
          paymentResult: checkout ? { type: paymentMethod, ...checkout } : null,
          selectedSlot: null,
          selectedGroupSession: null,
        });
      } catch (error) {
        this.setState({ saving: false, error: this.normalizeError(error, t.bookingFailed) });
      }
    }

    resetForAnotherBooking() {
      this.resetTurnstile();

      const selectedDate = this.todayInWidgetTimezone();
      this.setState({
        bookingSuccess: null,
        error: '',
        saving: false,
        selectedDate,
        calendarMonth: this.monthKeyForDate(selectedDate),
        selectedSlot: null,
        selectedGroupSession: null,
        groupSessions: [],
        manualTime: '',
        form: { firstName: '', lastName: '', email: '', phone: '' },
        paymentMethod: null,
        paymentResult: null,
        activeStep: this.shouldShowConsultantStep() ? 'consultant' : 'datetime',
      });

      void this.loadAvailability();
    }

    monthLabel() {
      const monthDate = parseIsoDate(this.state.calendarMonth) || new Date();
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase().startsWith('sl')
        ? 'sl-SI'
        : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthDate);
    }

    displaySelectedDate() {
      const date = parseIsoDate(this.state.selectedDate);
      if (!date) return '';
      const locale = String(this.options?.locale || DEFAULTS.locale || 'en').toLowerCase().startsWith('sl')
        ? 'sl-SI'
        : 'en-US';
      return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    }

    buildCalendarCells() {
      const monthDate = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
      const monthStart = firstOfMonth(monthDate);
      const nextMonthStart = addMonths(monthStart, 1);
      const totalDays = Math.round((nextMonthStart - monthStart) / 86400000);
      const lead = (monthStart.getDay() + 6) % 7;
      const totalCells = Math.ceil((lead + totalDays) / 7) * 7;
      const today = parseIsoDate(this.todayInWidgetTimezone()) || new Date();
      const selectedDate = this.state.selectedDate;
      const cells = [];

      for (let index = 0; index < totalCells; index += 1) {
        const dayOffset = index - lead;
        const cellDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 + dayOffset);
        const iso = formatIsoDate(cellDate);
        const inMonth = sameMonth(cellDate, monthStart);
        const disabled = iso < formatIsoDate(today);
        cells.push({
          iso,
          day: cellDate.getDate(),
          inMonth,
          disabled,
          selected: selectedDate === iso,
          today: iso === formatIsoDate(today),
        });
      }

      return cells;
    }

    calendarMarkup() {
      const t = this.text();
      const todayMonth = this.monthKeyForDate(this.todayInWidgetTimezone());
      const prevDisabled = this.state.calendarMonth <= todayMonth;
      const cells = this.buildCalendarCells();

      return `
        <div class="calendar-card">
          <div class="calendar-header">
            <button type="button" class="calendar-nav" data-action="month-prev" ${prevDisabled ? 'disabled' : ''} aria-label="${escapeHtml(t.monthPrev)}">‹</button>
            <div class="calendar-title">${escapeHtml(this.monthLabel())}</div>
            <button type="button" class="calendar-nav" data-action="month-next" aria-label="${escapeHtml(t.monthNext)}">›</button>
          </div>
          <div class="calendar-weekdays">
            ${t.weekdayShort.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="calendar-grid">
            ${cells.map((cell) => {
              if (!cell.inMonth) return '<span class="calendar-cell calendar-cell--empty"></span>';
              return `
                <button
                  type="button"
                  class="calendar-cell ${cell.selected ? 'is-selected' : ''} ${cell.today ? 'is-today' : ''}"
                  data-action="calendar-date"
                  data-date="${escapeHtml(cell.iso)}"
                  ${cell.disabled ? 'disabled' : ''}
                >
                  ${escapeHtml(cell.day)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    summaryMarkup() {
      const t = this.text();
      const service = this.currentService();
      const consultant = this.currentSummaryConsultant();
      const selectedTime = this.selectedTimeLabel();
      const canSubmit = this.isStepComplete('datetime');

      return `
        <aside class="summary-card ${this.state.activeStep === 'details' ? 'summary-card--final' : ''}">
          <div class="summary-heading">${escapeHtml(t.summaryTitle)}</div>
          ${service ? `
            <div class="summary-service">
              <div>
                <div class="summary-service-name">${escapeHtml(service.name)}</div>
                <div class="summary-service-meta">${escapeHtml(String(service.durationMinutes || this.state.config?.sessionLengthMinutes || 60))} ${escapeHtml(t.durationSuffix)}</div>
              </div>
              ${service.priceLabel ? `<div class="price-badge">${escapeHtml(service.priceLabel)}</div>` : ''}
            </div>
          ` : `<div class="empty empty--compact">${escapeHtml(t.summaryEmpty)}</div>`}

          ${consultant ? `
            <div class="summary-person">
              <div class="summary-avatar">${escapeHtml(this.initials(consultant.name))}</div>
              <div>
                <div class="summary-person-name">${escapeHtml(consultant.name)}</div>
                <div class="summary-person-meta">${escapeHtml(t.stepConsultant)}</div>
              </div>
            </div>
          ` : (this.shouldShowConsultantStep() && !this.consultantSelectionOptional()) ? '' : this.currentServiceSupportsGroupSessions() ? '' : `
            <div class="summary-inline-meta">${escapeHtml(t.stepConsultant)}: ${escapeHtml(t.optionalConsultant)}</div>
          `}

          ${(this.state.selectedDate || selectedTime) ? `
            <div class="summary-inline-meta summary-inline-meta--date">
              ${escapeHtml(this.displaySelectedDate())}${selectedTime ? ` · <strong>${escapeHtml(selectedTime)}</strong>` : ''}
            </div>
          ` : ''}

          <div class="summary-note">
            <div class="summary-note-icon">✓</div>
            <div>
              <strong>${escapeHtml(t.summaryPrivacyTitle)}</strong>
              <p>${escapeHtml(t.summaryPrivacyText)}</p>
            </div>
          </div>

          ${this.state.activeStep === 'details' ? `
            <div class="summary-actions">
              <button class="secondary secondary--full" type="button" data-action="refresh">${escapeHtml(this.state.config?.availabilityEnabled ? t.refreshAvailability : t.refreshSlots)}</button>
              <button class="primary primary--full" type="button" data-action="submit" ${this.state.saving || !canSubmit ? 'disabled' : ''}>${escapeHtml(this.state.saving ? t.submitting : t.submit)}</button>
            </div>
          ` : ''}
        </aside>
      `;
    }

    renderProgress() {
      const steps = this.stepDefinitions();
      const activeIndex = this.activeStepIndex();
      return `
        <div class="progress" role="list">
          ${steps.map((step, index) => {
            const isDone = index < activeIndex || (index === activeIndex && this.state.bookingSuccess);
            const isActive = index === activeIndex && !this.state.bookingSuccess;
            return `
              <div class="progress-item ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}" role="listitem">
                <span class="progress-dot">${isDone ? '✓' : index + 1}</span>
                <span class="progress-label">${escapeHtml(step.label)}</span>
              </div>
            `;
          }).join('<div class="progress-sep"></div>')}
        </div>
      `;
    }

    renderStepContent() {
      const t = this.text();
      const service = this.currentService();
      const showConsultantStep = this.shouldShowConsultantStep();

      if (this.state.bookingSuccess) {
        const bt = this.state.paymentResult?.type === 'BANK_TRANSFER' ? this.state.paymentResult.bankTransfer : null;
        return `
          <div class="success-screen">
            <div class="success-icon">✓</div>
            <div class="success-title">${escapeHtml(t.confirmed)}</div>
            <p class="success-copy">
              ${escapeHtml(this.state.bookingSuccess.serviceName || service?.name || t.sessionFallback)} · ${escapeHtml(this.state.bookingSuccess.startsAtLabel || this.state.bookingSuccess.startTime || '')}
            </p>
            <p class="success-copy">${escapeHtml(t.confirmationSent)} ${escapeHtml(this.state.bookingSuccess.email || this.state.form.email)}.</p>
            ${bt ? `
              <div class="bank-transfer-box">
                <div class="bank-transfer-title">${escapeHtml(t.bankTransferTitle)}</div>
                <div class="bank-transfer-row"><span>${escapeHtml(t.bankTransferAmount)}:</span> <strong>${escapeHtml(String(bt.amount))} ${escapeHtml(bt.currency || '')}</strong></div>
                <div class="bank-transfer-row"><span>${escapeHtml(t.bankTransferReference)}:</span> <strong>${escapeHtml(bt.referenceCode || '')}</strong></div>
                ${bt.instructions ? `<p class="bank-transfer-instructions">${escapeHtml(bt.instructions)}</p>` : ''}
              </div>
            ` : ''}
            <button class="primary" type="button" data-action="restart">${escapeHtml(t.bookAnother)}</button>
          </div>
        `;
      }

      if (this.state.activeStep === 'service') {
        return `
          <section class="panel-section">
            <div class="panel-copy">
              <div class="eyebrow">1</div>
              <h3>${escapeHtml(t.sectionService)}</h3>
              <p>${escapeHtml(t.subtitle)}</p>
            </div>
            <div class="selection-grid">
              ${this.state.services.map((item) => `
                <button class="select-card ${this.state.selectedServiceId === item.id ? 'is-active' : ''}" type="button" data-action="service" data-id="${item.id}">
                  <div class="select-card-head">
                    <div>
                      <div class="select-card-title">${escapeHtml(item.name)}</div>
                      <div class="select-card-meta">${escapeHtml(String(item.durationMinutes || this.state.config?.sessionLengthMinutes || 60))} ${escapeHtml(t.durationSuffix)}</div>
                    </div>
                    ${item.priceLabel ? `<div class="price-badge">${escapeHtml(item.priceLabel)}</div>` : ''}
                  </div>
                  ${item.description ? `<div class="select-card-body">${escapeHtml(item.description)}</div>` : ''}
                </button>
              `).join('')}
            </div>
            <div class="panel-actions">
              <span></span>
              <button class="primary" type="button" data-action="next" ${!service ? 'disabled' : ''}>${escapeHtml(t.continue)}</button>
            </div>
          </section>
        `;
      }

      if (this.state.activeStep === 'consultant') {
        return `
          <section class="panel-section panel-section--split">
            <div>
              <div class="panel-copy panel-copy--compact">
                <div class="eyebrow">2</div>
                <h3>${escapeHtml(t.sectionConsultant)}</h3>
              </div>
              <div class="selection-grid">
                ${this.state.consultants.length ? this.state.consultants.map((item) => `
                  <button class="consultant-card ${this.state.selectedConsultantId === item.id ? 'is-active' : ''}" type="button" data-action="consultant" data-id="${item.id}">
                    <div class="summary-avatar">${escapeHtml(this.initials(item.name))}</div>
                    <div>
                      <div class="select-card-title">${escapeHtml(item.name)}</div>
                      <div class="select-card-meta">${escapeHtml(t.stepConsultant)}</div>
                    </div>
                  </button>
                `).join('') : `<div class="empty">${escapeHtml(t.noConsultants)}</div>`}
              </div>
              ${this.consultantSelectionOptional() ? `<div class="summary-inline-meta">${escapeHtml(t.groupSessionSelectionHint)}</div>` : ''}
              <div class="panel-actions">
                <button class="secondary" type="button" data-action="back">${escapeHtml(t.back)}</button>
                <button class="primary" type="button" data-action="next" ${!this.isStepComplete('consultant') ? 'disabled' : ''}>${escapeHtml(t.continue)}</button>
              </div>
            </div>
            ${this.summaryMarkup()}
          </section>
        `;
      }

      if (this.state.activeStep === 'datetime') {
        return `
          <section class="panel-section panel-section--split">
            <div>
              <div class="panel-copy panel-copy--compact">
                <div class="eyebrow">${showConsultantStep ? '3' : '2'}</div>
                <h3>${escapeHtml(t.sectionDateTime)}</h3>
              </div>
              ${this.calendarMarkup()}
              ${this.currentServiceSupportsGroupSessions() ? `
                <div class="times-card">
                  <div class="times-head">
                    <div>
                      <div class="times-title">${escapeHtml(t.groupSessionsTitle)}</div>
                      <div class="times-subtitle">${escapeHtml(t.groupSessionsSubtitle)}</div>
                    </div>
                  </div>
                  ${this.state.loadingAvailability
                    ? `<div class="loading-inline">${escapeHtml(t.loadingAvailability)}</div>`
                    : this.state.groupSessions.length
                      ? `<div class="slot-grid">${this.state.groupSessions.map((session) => `
                          <button
                            class="slot-chip ${this.state.selectedGroupSession?.id === session.id ? 'is-active' : ''}"
                            type="button"
                            data-action="group-session"
                            data-id="${session.id}"
                            data-start="${escapeHtml(session.startTime)}"
                            data-end="${escapeHtml(session.endTime)}"
                            data-label="${escapeHtml(session.label)}"
                            data-consultant-id="${session.consultantId == null ? '' : session.consultantId}"
                            data-consultant-name="${escapeHtml(session.consultantName || '')}"
                            data-remaining-spots="${session.remainingSpots == null ? '' : session.remainingSpots}"
                            data-booked-participants="${session.bookedParticipants == null ? '' : session.bookedParticipants}"
                          >
                            <span>${escapeHtml(session.label)}</span>
                            <small>${escapeHtml(session.consultantName || t.groupSessionAvailable)}${session.remainingSpots != null ? ` · ${escapeHtml(String(session.remainingSpots))} ${escapeHtml(t.groupSessionSpotsLeft)}` : ''}</small>
                          </button>
                        `).join('')}</div>`
                      : `<div class="empty">${escapeHtml(t.groupSessionNoOptions)}</div>`}
                </div>
              ` : ''}
              ${this.currentServiceSupportsGroupSessions() ? '' : `
                <div class="times-card">
                  <div class="times-head">
                    <div>
                      <div class="times-title">${escapeHtml(this.state.config?.availabilityEnabled ? t.labelSlots : t.labelTime)}</div>
                      <div class="times-subtitle">${escapeHtml(this.displaySelectedDate())}</div>
                    </div>
                    <button class="text-link" type="button" data-action="refresh">${escapeHtml(this.state.config?.availabilityEnabled ? t.refreshAvailability : t.refreshSlots)}</button>
                  </div>
                  ${this.state.config?.availabilityEnabled ? `
                    ${showConsultantStep && !this.state.selectedConsultantId
                      ? `<div class="empty">${escapeHtml(t.consultantRequiredHint)}</div>`
                      : this.state.loadingAvailability
                        ? `<div class="loading-inline">${escapeHtml(t.loadingAvailability)}</div>`
                        : this.state.slots.length
                          ? `<div class="slot-grid">${this.state.slots.map((slot) => `
                              <button
                                class="slot-chip ${this.state.selectedSlot?.startTime === slot.startTime && this.state.selectedSlot?.consultantId === slot.consultantId ? 'is-active' : ''}"
                                type="button"
                                data-action="slot"
                                data-slot-id="${escapeHtml(slot.slotId || '')}"
                                data-start="${escapeHtml(slot.startTime)}"
                                data-end="${escapeHtml(slot.endTime || '')}"
                                data-label="${escapeHtml(slot.label)}"
                                data-consultant-id="${slot.consultantId == null ? '' : slot.consultantId}"
                                data-consultant-name="${escapeHtml(slot.consultantName || '')}"
                              >
                                <span>${escapeHtml(slot.label)}</span>
                                ${((!showConsultantStep || !this.state.selectedConsultantId) && slot.consultantName) ? `<small>${escapeHtml(slot.consultantName)}</small>` : ''}
                              </button>
                            `).join('')}</div>`
                          : `<div class="empty">${escapeHtml(t.noSlots)}</div>`}
                  ` : `
                    <div class="manual-time-wrap">
                      <select id="manual-time">
                        <option value="">${escapeHtml(t.chooseTime)}</option>
                        ${this.manualTimeOptions(this.state.config).map((time) => `<option value="${time}" ${this.state.manualTime === time ? 'selected' : ''}>${time}</option>`).join('')}
                      </select>
                    </div>
                  `}
                </div>
              `}
              <div class="panel-actions">
                <button class="secondary" type="button" data-action="back">${escapeHtml(t.back)}</button>
                <button class="primary" type="button" data-action="next" ${!this.isStepComplete('datetime') ? 'disabled' : ''}>${escapeHtml(t.continue)}</button>
              </div>
            </div>
            ${this.summaryMarkup()}
          </section>
        `;
      }

      const allowed = this.allowedPaymentMethods();
      const hasAnyPaymentMethod = Boolean(allowed.card || allowed.bankTransfer || allowed.paypal);
      const methodCard = (type, title, subtitle, enabled) => `
        <button
          class="payment-method-card ${this.state.paymentMethod === type ? 'is-active' : ''}"
          type="button"
          data-action="payment-method"
          data-method="${type}"
          ${enabled ? '' : 'disabled'}
        >
          <div class="payment-method-main">
            <div class="payment-method-title">${escapeHtml(title)}</div>
            <div class="payment-method-subtitle">${escapeHtml(subtitle)}</div>
          </div>
        </button>
      `;
      return `
        <section class="panel-section panel-section--split panel-section--details">
          <div>
            <div class="panel-copy panel-copy--compact">
              <div class="eyebrow">${showConsultantStep ? '4' : '3'}</div>
              <h3>${escapeHtml(t.sectionGuest)}</h3>
              <p>${escapeHtml(t.summaryPrivacyText)}</p>
            </div>
            <div class="details-grid">
              <div>
                <label for="first-name">${escapeHtml(t.labelFirstName)}</label>
                <input id="first-name" type="text" value="${escapeHtml(this.state.form.firstName)}" placeholder="${escapeHtml(t.firstNamePlaceholder)}" />
              </div>
              <div>
                <label for="last-name">${escapeHtml(t.labelLastName)}</label>
                <input id="last-name" type="text" value="${escapeHtml(this.state.form.lastName)}" placeholder="${escapeHtml(t.lastNamePlaceholder)}" />
              </div>
              <div class="full">
                <label for="email">${escapeHtml(t.labelEmail)}</label>
                <input id="email" type="email" value="${escapeHtml(this.state.form.email)}" placeholder="${escapeHtml(t.emailPlaceholder)}" />
              </div>
              <div class="full">
                <label for="phone">${escapeHtml(t.labelPhone)}</label>
                <input id="phone" type="tel" value="${escapeHtml(this.state.form.phone)}" placeholder="${escapeHtml(t.phonePlaceholder)}" />
              </div>
            </div>

            <div class="payment-methods">
              <div class="payment-methods-title">${escapeHtml(t.paymentMethodTitle)}</div>
              ${hasAnyPaymentMethod ? `
                <div class="payment-methods-grid">
                  ${allowed.card ? methodCard('CARD', t.paymentMethodCard, t.paymentMethodCardSubtitle, true) : ''}
                  ${allowed.bankTransfer ? methodCard('BANK_TRANSFER', t.paymentMethodBank, t.paymentMethodBankSubtitle, true) : ''}
                  ${allowed.paypal ? methodCard('PAYPAL', t.paymentMethodPaypal, t.paymentMethodPaypalSubtitle, true) : ''}
                </div>
              ` : `<div class="empty">${escapeHtml(t.paymentMethodsNone)}</div>`}
            </div>

            ${this.shouldRenderTurnstile() ? `<div class="turnstile-wrap"><slot name="turnstile-slot"></slot></div>` : ''}
            <div class="panel-actions panel-actions--details-mobile">
              <button class="secondary" type="button" data-action="back">${escapeHtml(t.back)}</button>
              <button class="primary" type="button" data-action="submit" ${!this.isStepComplete('details') || this.state.saving ? 'disabled' : ''}>${escapeHtml(this.state.saving ? t.submitting : t.submit)}</button>
            </div>
          </div>
          ${this.summaryMarkup()}
        </section>
      `;
    }

    styles() {
      return `
        :host {
          --calendra-primary: ${this.options.primaryColor};
          --calendra-accent: ${this.options.accentColor};
          --calendra-bg: #f7f6f3;
          --calendra-surface: #ffffff;
          --calendra-surface-soft: #fbfbf9;
          --calendra-surface-muted: #f2f4f8;
          --calendra-text: #182033;
          --calendra-muted: #667085;
          --calendra-border: #e6e8ee;
          --calendra-shadow: 0 24px 50px rgba(16, 24, 40, 0.08);
          --calendra-primary-soft: color-mix(in srgb, var(--calendra-primary) 14%, white);
          --calendra-primary-strong: color-mix(in srgb, var(--calendra-primary) 84%, black 8%);
          display: block;
          color: var(--calendra-text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        * { box-sizing: border-box; }
        button, input, select { font: inherit; }
        .widget {
          background: linear-gradient(180deg, #fbfbfa 0%, #f5f5f2 100%);
          border: 1px solid var(--calendra-border);
          border-radius: 30px;
          box-shadow: var(--calendra-shadow);
          overflow: hidden;
        }
        .shell { padding: 22px; display: grid; gap: 18px; }
        .topbar {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 6px 4px 2px;
        }
        .badge {
          display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
          background: var(--calendra-primary-soft); color: var(--calendra-text);
          padding: 10px 14px; font-size: 13px; font-weight: 800;
        }
        .tenant-pill {
          border-radius: 999px; background: rgba(255,255,255,0.72); border: 1px solid var(--calendra-border);
          color: var(--calendra-primary-strong); padding: 8px 12px; font-size: 12px; font-weight: 700;
        }
        .progress {
          display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 4px 2px;
        }
        .progress-item {
          display: inline-flex; align-items: center; gap: 10px; color: var(--calendra-muted); font-weight: 700;
        }
        .progress-dot {
          width: 32px; height: 32px; border-radius: 999px; display: inline-grid; place-items: center;
          background: rgba(255,255,255,0.72); border: 1px solid var(--calendra-border); font-size: 14px;
        }
        .progress-item.is-active { color: var(--calendra-text); }
        .progress-item.is-active .progress-dot {
          background: var(--calendra-primary-strong); color: white; border-color: transparent;
        }
        .progress-item.is-done { color: var(--calendra-text); }
        .progress-item.is-done .progress-dot {
          background: #22c55e; color: white; border-color: transparent;
        }
        .progress-sep {
          width: 28px; height: 1px; background: color-mix(in srgb, var(--calendra-border) 80%, transparent);
        }
        .panel {
          border-radius: 28px; background: rgba(255,255,255,0.86); border: 1px solid var(--calendra-border);
          padding: 22px; box-shadow: 0 10px 24px rgba(16, 24, 40, 0.04);
        }
        .headline h2 {
          margin: 0; font-size: clamp(28px, 4vw, 52px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 850;
        }
        .headline p {
          margin: 10px 0 0; color: var(--calendra-muted); font-size: 17px; line-height: 1.6;
        }
        .error {
          padding: 14px 16px; border-radius: 18px; background: rgba(239, 68, 68, 0.09); color: #b42318; font-size: 14px;
          border: 1px solid rgba(239, 68, 68, 0.14);
        }
        .loading, .loading-inline {
          padding: 18px; color: var(--calendra-muted); font-size: 14px;
        }
        .success-screen {
          min-height: 360px; display: grid; place-items: center; text-align: center; gap: 14px; padding: 24px 16px 10px;
        }
        .success-icon {
          width: 72px; height: 72px; border-radius: 999px; display: grid; place-items: center; font-size: 30px;
          background: rgba(34, 197, 94, 0.12); color: #15803d; font-weight: 900;
        }
        .success-title { font-size: 28px; font-weight: 850; }
        .success-copy { margin: 0; color: var(--calendra-muted); line-height: 1.6; }
        .panel-section { display: grid; gap: 22px; }
        .panel-section--split { grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr); align-items: start; gap: 22px; }
        .panel-copy h3 { margin: 0; font-size: 22px; font-weight: 850; }
        .panel-copy p { margin: 8px 0 0; color: var(--calendra-muted); line-height: 1.6; }
        .panel-copy--compact p { font-size: 14px; }
        .eyebrow {
          width: 40px; height: 40px; display: inline-grid; place-items: center; border-radius: 999px;
          background: color-mix(in srgb, var(--calendra-primary) 14%, white); color: var(--calendra-primary-strong);
          font-weight: 800; margin-bottom: 14px;
        }
        .selection-grid { display: grid; gap: 14px; }
        .select-card, .consultant-card {
          width: 100%; border: 1px solid var(--calendra-border); background: white; color: inherit;
          border-radius: 24px; padding: 18px 18px; text-align: left; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
          box-shadow: 0 2px 8px rgba(16,24,40,0.03);
        }
        .select-card:hover, .consultant-card:hover, .slot-chip:hover, .calendar-cell:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--calendra-primary) 42%, var(--calendra-border));
        }
        .select-card.is-active, .consultant-card.is-active, .slot-chip.is-active {
          border-color: color-mix(in srgb, var(--calendra-primary) 72%, white);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--calendra-primary) 12%, white), 0 8px 18px rgba(22, 114, 243, 0.08);
        }
        .select-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .select-card-title { font-size: 22px; font-weight: 850; letter-spacing: -0.02em; }
        .select-card-meta, .select-card-body, .summary-service-meta, .summary-person-meta, .summary-inline-meta { color: var(--calendra-muted); }
        .select-card-body { margin-top: 10px; font-size: 14px; line-height: 1.55; }
        .consultant-card { display: flex; align-items: center; gap: 14px; }
        .summary-avatar {
          width: 54px; height: 54px; border-radius: 18px; display: grid; place-items: center;
          background: linear-gradient(135deg, color-mix(in srgb, var(--calendra-primary) 16%, white), rgba(255,255,255,0.95));
          color: var(--calendra-primary-strong); font-weight: 900;
        }
        .calendar-card, .times-card, .summary-card {
          background: white; border: 1px solid var(--calendra-border); border-radius: 26px; padding: 18px;
          box-shadow: 0 12px 28px rgba(16,24,40,0.05);
        }
        .calendar-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
        .calendar-title { font-size: 18px; font-weight: 850; text-transform: capitalize; }
        .calendar-nav {
          width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--calendra-border); background: white; cursor: pointer;
          color: var(--calendra-text); font-size: 20px;
        }
        .calendar-nav:disabled { opacity: 0.45; cursor: default; }
        .calendar-weekdays, .calendar-grid {
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px;
        }
        .calendar-weekdays { margin-bottom: 10px; color: var(--calendra-muted); font-size: 13px; text-align: center; }
        .calendar-cell {
          aspect-ratio: 1; border-radius: 18px; border: 1px solid transparent; background: transparent; cursor: pointer;
          color: var(--calendra-text); font-weight: 700;
        }
        .calendar-cell.is-selected {
          background: var(--calendra-primary-strong); color: white;
        }
        .calendar-cell.is-today:not(.is-selected) {
          border-color: color-mix(in srgb, var(--calendra-primary) 42%, var(--calendra-border));
          background: var(--calendra-primary-soft);
        }
        .calendar-cell:disabled { opacity: 0.35; cursor: default; }
        .calendar-cell--empty { visibility: hidden; }
        .times-card { display: grid; gap: 14px; }
        .times-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
        .times-title { font-size: 18px; font-weight: 850; }
        .times-subtitle { color: var(--calendra-muted); font-size: 14px; margin-top: 4px; }
        .text-link {
          border: 0; background: transparent; padding: 0; color: var(--calendra-primary-strong); cursor: pointer; font-weight: 700;
        }
        .slot-grid {
          display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;
        }
        .slot-chip {
          width: 100%; min-height: 68px; border-radius: 20px; border: 1px solid var(--calendra-border);
          background: white; cursor: pointer; display: grid; gap: 4px; place-items: center; padding: 10px 8px;
          font-weight: 800; color: var(--calendra-text);
        }
        .slot-chip small { color: var(--calendra-muted); font-weight: 600; }
        .manual-time-wrap select,
        input {
          width: 100%; border: 1px solid var(--calendra-border); background: white; color: var(--calendra-text);
          border-radius: 18px; padding: 15px 16px; min-height: 54px; outline: none;
        }
        input:focus, select:focus {
          border-color: color-mix(in srgb, var(--calendra-primary) 58%, var(--calendra-border));
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--calendra-primary) 12%, white);
        }
        .turnstile-wrap { margin-top: 14px; min-height: 70px; }
        .details-grid {
          display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .details-grid .full { grid-column: 1 / -1; }
        label {
          display: block; margin-bottom: 8px; font-size: 14px; font-weight: 700;
        }
        .summary-card { position: sticky; top: 18px; display: grid; gap: 16px; }
        .summary-card--final { box-shadow: 0 18px 36px rgba(22,114,243,0.08); }
        .summary-heading { font-size: 18px; font-weight: 850; }
        .summary-service {
          display: flex; align-items: start; justify-content: space-between; gap: 12px; padding-bottom: 2px;
        }
        .summary-service-name { font-size: 16px; font-weight: 850; letter-spacing: -0.01em; }
        .summary-person {
          display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 20px; background: var(--calendra-surface-soft);
          border: 1px solid var(--calendra-border);
        }
        .summary-person-name { font-size: 16px; font-weight: 800; }
        .summary-inline-meta--date strong { color: var(--calendra-text); }
        .summary-note {
          display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 14px;
          border-radius: 20px; background: color-mix(in srgb, var(--calendra-primary) 7%, white); border: 1px solid var(--calendra-border);
        }
        .summary-note-icon {
          width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center;
          background: white; color: var(--calendra-primary-strong); font-weight: 900;
        }
        .summary-note p { margin: 6px 0 0; color: var(--calendra-muted); line-height: 1.55; font-size: 14px; }
        .summary-actions { display: grid; gap: 10px; }
        .panel-actions {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .panel-actions--details-mobile { display: none; }
        .primary, .secondary, .secondary--full, .primary--full {
          min-height: 52px; border-radius: 999px; padding: 12px 18px; border: 0; cursor: pointer; font-weight: 800;
        }
        .primary, .primary--full {
          background: linear-gradient(135deg, color-mix(in srgb, var(--calendra-primary) 94%, white), color-mix(in srgb, var(--calendra-primary) 78%, black 8%));
          color: white;
          box-shadow: 0 14px 24px rgba(22,114,243,0.22);
        }
        .secondary, .secondary--full {
          background: white; border: 1px solid var(--calendra-border); color: var(--calendra-muted);
        }
        .secondary--full, .primary--full { width: 100%; }
        .primary:disabled, .secondary:disabled, .primary--full:disabled, .secondary--full:disabled {
          opacity: 0.55; cursor: default; box-shadow: none;
        }
        .price-badge {
          display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 10px;
          border-radius: 999px; background: color-mix(in srgb, var(--calendra-accent) 12%, white); color: var(--calendra-accent); font-weight: 800; font-size: 12px;
        }
        .empty {
          padding: 18px; border-radius: 20px; border: 1px dashed var(--calendra-border); background: var(--calendra-surface-soft); color: var(--calendra-muted);
        }
        .empty--compact { padding: 14px; }
        .payment-methods { margin-top: 18px; display: grid; gap: 10px; }
        .payment-methods-title { font-weight: 700; color: var(--calendra-text); font-size: 15px; }
        .payment-methods-grid { display: grid; gap: 10px; grid-template-columns: 1fr; }
        .payment-method-card {
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          padding: 14px 16px; border-radius: 14px; border: 1px solid var(--calendra-border);
          background: var(--calendra-surface); color: var(--calendra-text);
          text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, background .15s;
        }
        .payment-method-card:hover:not([disabled]) { border-color: var(--calendra-primary); }
        .payment-method-card.is-active { border-color: var(--calendra-primary); background: var(--calendra-primary-soft); box-shadow: inset 0 0 0 1px var(--calendra-primary); }
        .payment-method-card[disabled] { opacity: 0.5; cursor: not-allowed; }
        .payment-method-title { font-weight: 700; }
        .payment-method-subtitle { color: var(--calendra-muted); font-size: 13px; margin-top: 2px; }
        .bank-transfer-box {
          margin-top: 14px; text-align: left; padding: 16px; border-radius: 14px;
          border: 1px solid var(--calendra-border); background: var(--calendra-surface-soft); display: grid; gap: 6px;
        }
        .bank-transfer-title { font-weight: 800; color: var(--calendra-text); margin-bottom: 4px; }
        .bank-transfer-row { color: var(--calendra-text); font-size: 14px; }
        .bank-transfer-row span { color: var(--calendra-muted); margin-right: 6px; }
        .bank-transfer-instructions { margin: 6px 0 0; color: var(--calendra-muted); font-size: 13px; }
        :host([data-layout="compact"]) .panel-section--split,
        :host([data-layout="narrow"]) .panel-section--split,
        :host([data-layout="micro"]) .panel-section--split {
          grid-template-columns: 1fr;
        }
        :host([data-layout="compact"]) .summary-card,
        :host([data-layout="narrow"]) .summary-card,
        :host([data-layout="micro"]) .summary-card {
          position: static;
        }
        :host([data-layout="compact"]) .shell,
        :host([data-layout="narrow"]) .shell {
          padding: 18px;
        }
        :host([data-layout="compact"]) .headline h2 {
          font-size: clamp(28px, 6vw, 42px);
        }
        :host([data-layout="compact"]) .headline p {
          font-size: 15px;
        }
        :host([data-layout="compact"]) .slot-grid,
        :host([data-layout="narrow"]) .slot-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        :host([data-layout="compact"]) .details-grid,
        :host([data-layout="narrow"]) .details-grid,
        :host([data-layout="micro"]) .details-grid {
          grid-template-columns: 1fr;
        }
        :host([data-layout="compact"]) .details-grid .full,
        :host([data-layout="narrow"]) .details-grid .full,
        :host([data-layout="micro"]) .details-grid .full {
          grid-column: auto;
        }
        :host([data-layout="compact"]) .topbar,
        :host([data-layout="narrow"]) .topbar,
        :host([data-layout="micro"]) .topbar {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        :host([data-layout="compact"]) .progress,
        :host([data-layout="narrow"]) .progress,
        :host([data-layout="micro"]) .progress {
          gap: 8px;
        }
        :host([data-layout="compact"]) .progress-label,
        :host([data-layout="narrow"]) .progress-label,
        :host([data-layout="micro"]) .progress-label {
          font-size: 13px;
          line-height: 1.2;
        }
        :host([data-layout="narrow"]) .shell,
        :host([data-layout="micro"]) .shell {
          padding: 14px;
        }
        :host([data-layout="narrow"]) .panel,
        :host([data-layout="micro"]) .panel {
          padding: 18px;
          border-radius: 24px;
        }
        :host([data-layout="narrow"]) .headline h2 {
          font-size: clamp(26px, 8vw, 36px);
        }
        :host([data-layout="narrow"]) .headline p,
        :host([data-layout="micro"]) .headline p {
          font-size: 14px;
          line-height: 1.5;
        }
        :host([data-layout="narrow"]) .calendar-card,
        :host([data-layout="narrow"]) .times-card,
        :host([data-layout="narrow"]) .summary-card,
        :host([data-layout="micro"]) .calendar-card,
        :host([data-layout="micro"]) .times-card,
        :host([data-layout="micro"]) .summary-card {
          padding: 16px;
          border-radius: 22px;
        }
        :host([data-layout="narrow"]) .times-head,
        :host([data-layout="micro"]) .times-head {
          flex-direction: column;
        }
        :host([data-layout="narrow"]) .panel-actions,
        :host([data-layout="micro"]) .panel-actions {
          flex-direction: column-reverse;
          align-items: stretch;
        }
        :host([data-layout="narrow"]) .panel-actions span,
        :host([data-layout="micro"]) .panel-actions span {
          display: none;
        }
        :host([data-layout="narrow"]) .panel-actions--details-mobile,
        :host([data-layout="micro"]) .panel-actions--details-mobile {
          display: flex;
        }
        :host([data-layout="micro"]) .headline h2 {
          font-size: 30px;
        }
        :host([data-layout="micro"]) .progress {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        :host([data-layout="micro"]) .progress-sep {
          display: none;
        }
        :host([data-layout="micro"]) .progress-item {
          min-width: 0;
          padding: 8px 10px;
          border-radius: 16px;
          border: 1px solid var(--calendra-border);
          background: rgba(255,255,255,0.72);
        }
        :host([data-layout="micro"]) .progress-dot {
          width: 28px;
          height: 28px;
          font-size: 13px;
        }
        :host([data-layout="micro"]) .slot-grid {
          grid-template-columns: 1fr;
        }
        :host([data-layout="micro"]) .calendar-weekdays,
        :host([data-layout="micro"]) .calendar-grid {
          gap: 6px;
        }
        :host([data-layout="micro"]) .calendar-cell {
          border-radius: 14px;
        }
      `;
    }

    render() {
      const t = this.text();
      this.shadowRoot.innerHTML = `
        <style>${this.styles()}</style>
        <div class="widget">
          <div class="shell">
            <div class="topbar">
              <div class="badge">${escapeHtml(t.badge)}</div>
              <div class="tenant-pill">Tenant ${escapeHtml(this.options.tenant || '')}</div>
            </div>
            ${this.renderProgress()}
            <div class="panel">
              <div class="headline">
                <h2>${escapeHtml(t.title)}</h2>
                <p>${escapeHtml(t.subtitle)}</p>
              </div>
              ${this.state.loading ? `<div class="loading">${escapeHtml(t.loading)}</div>` : ''}
              ${!this.state.loading && this.state.error ? `<div class="error">${escapeHtml(this.state.error)}</div>` : ''}
              ${!this.state.loading && this.state.config ? this.renderStepContent() : ''}
            </div>
          </div>
        </div>
      `;

      this.bindEvents();

      if (this.shouldRenderTurnstile()) {
        this.scheduleTurnstileMount();
      } else {
        this.resetTurnstile();
        this.removeLightDomTurnstileHost();
      }
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
          this.resetTurnstile();

          this.setState({
            selectedServiceId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
            selectedGroupSession: null,
            groupSessions: [],
            manualTime: '',
          });
          await this.loadConsultantsAndAvailability();
          if (this.state.config?.turnstileEnabled && this.state.config?.turnstileSiteKey) {
            await this.ensureTurnstileScript();
          }
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="consultant"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.resetTurnstile();

          this.setState({
            selectedConsultantId: Number(button.dataset.id),
            bookingSuccess: null,
            error: '',
            selectedSlot: null,
            selectedGroupSession: null,
            manualTime: '',
          });
          await this.loadAvailability();
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="calendar-date"]').forEach((button) => {
        button.addEventListener('click', async () => {
          this.resetTurnstile();

          this.setState({
            selectedDate: button.dataset.date,
            calendarMonth: this.monthKeyForDate(button.dataset.date),
            selectedSlot: null,
            selectedGroupSession: null,
            manualTime: '',
            bookingSuccess: null,
            error: '',
          });
          await this.loadAvailability();
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="month-prev"]').forEach((button) => {
        button.addEventListener('click', () => {
          const current = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
          const previous = addMonths(current, -1);
          const minMonth = parseIsoDate(this.monthKeyForDate(this.todayInWidgetTimezone())) || firstOfMonth(new Date());
          if (previous < minMonth) return;
          this.setState({ calendarMonth: formatIsoDate(previous) });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="month-next"]').forEach((button) => {
        button.addEventListener('click', () => {
          const current = parseIsoDate(this.state.calendarMonth) || firstOfMonth(new Date());
          this.setState({ calendarMonth: formatIsoDate(addMonths(current, 1)) });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="slot"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedSlot: {
              slotId: button.dataset.slotId || '',
              startTime: button.dataset.start,
              endTime: button.dataset.end || '',
              consultantId: parseOptionalNumber(button.dataset.consultantId),
              consultantName: button.dataset.consultantName || '',
              label: button.dataset.label || button.textContent.trim(),
            },
            selectedGroupSession: null,
            error: '',
          });
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="group-session"]').forEach((button) => {
        button.addEventListener('click', () => {
          this.setState({
            selectedGroupSession: {
              id: parseOptionalNumber(button.dataset.id),
              startTime: button.dataset.start,
              endTime: button.dataset.end,
              consultantId: parseOptionalNumber(button.dataset.consultantId),
              consultantName: button.dataset.consultantName || '',
              label: button.dataset.label || button.textContent.trim(),
              remainingSpots: parseOptionalNumber(button.dataset.remainingSpots),
              bookedParticipants: parseOptionalNumber(button.dataset.bookedParticipants),
            },
            selectedSlot: null,
            error: '',
          });
        });
      });

      const manualTime = this.shadowRoot.getElementById('manual-time');
      if (manualTime) {
        manualTime.addEventListener('change', (event) => {
          this.setState({ manualTime: event.target.value, error: '' });
        });
      }

      ['first-name', 'last-name', 'email', 'phone'].forEach((id) => {
        const input = this.shadowRoot.getElementById(id);
        if (!input) return;
        input.addEventListener('input', (event) => {
          const fieldMap = { 'first-name': 'firstName', 'last-name': 'lastName', email: 'email', phone: 'phone' };
          this.updateForm(fieldMap[id], event.target.value);
        });
      });

      const next = this.shadowRoot.querySelector('[data-action="next"]');
      if (next) {
        next.addEventListener('click', () => {
          if (!this.validateCurrentStep()) return;
          this.goToNextStep();
        });
      }

      this.shadowRoot.querySelectorAll('[data-action="back"]').forEach((button) => {
        button.addEventListener('click', () => this.goToPreviousStep());
      });

      this.shadowRoot.querySelectorAll('[data-action="refresh"]').forEach((button) => {
        button.addEventListener('click', () => {
          if (this.state.config?.availabilityEnabled) {
            void this.loadAvailability();
          }
        });
      });

      this.shadowRoot.querySelectorAll('[data-action="submit"]').forEach((button) => {
        button.addEventListener('click', () => this.submitBooking());
      });

      this.shadowRoot.querySelectorAll('[data-action="payment-method"]').forEach((button) => {
        button.addEventListener('click', () => {
          const method = button.dataset.method;
          if (!method || !this.isPaymentMethodAvailable(method)) return;
          this.setState({ paymentMethod: method, error: '' });
        });
      });

      const restart = this.shadowRoot.querySelector('[data-action="restart"]');
      if (restart) restart.addEventListener('click', () => this.resetForAnotherBooking());
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
