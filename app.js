(function () {
  const catalog = window.ECOWATER_CATALOG || { meta: {}, categories: [], products: [], templateQuote: [] };
  const baseProducts = catalog.products || [];
  let products = baseProducts;
  let customSettings = { categoryOrder: [], productOrder: [], deletedProductIds: [] };
  let session = null;
  let activeUser = '';
  let saveTimer = null;
  const legacyStorageKeys = {
    quote: 'ecowaterQuoteItems',
    customer: 'ecowaterCustomer',
    offer: 'ecowaterOffer',
    terms: 'ecowaterTerms',
    quoteCode: 'ecowaterQuoteCode'
  };
  const textFormatVersion = 3;

  const els = {
    catalogStats: document.getElementById('catalogStats'),
    loadTemplateButton: document.getElementById('loadTemplateButton'),
    clearQuoteButton: document.getElementById('clearQuoteButton'),
    exportPdfButton: document.getElementById('exportPdfButton'),
    printQuoteButton: document.getElementById('printQuoteButton'),
    accountInfo: document.getElementById('accountInfo'),
    activeUserLabel: document.getElementById('activeUserLabel'),
    activeUserSelect: document.getElementById('activeUserSelect'),
    changePasswordButton: document.getElementById('changePasswordButton'),
    logoutButton: document.getElementById('logoutButton'),
    quoteRecordsLink: document.getElementById('quoteRecordsLink'),
    quoteTableBody: document.getElementById('quoteTableBody'),
    subtotalCell: document.getElementById('subtotalCell'),
    offerInput: document.getElementById('offerInput'),
    imageDialog: document.getElementById('imageDialog'),
    closeImageDialog: document.getElementById('closeImageDialog'),
    largeImage: document.getElementById('largeImage'),
    quoteCode: document.getElementById('quoteCode'),
    customerCompany: document.getElementById('customerCompany'),
    customerAddress: document.getElementById('customerAddress'),
    customerName: document.getElementById('customerName'),
    customerPhone: document.getElementById('customerPhone'),
    sellerName: document.getElementById('sellerName'),
    sellerPhone: document.getElementById('sellerPhone'),
    term1: document.getElementById('term1'),
    term2: document.getElementById('term2'),
    term3: document.getElementById('term3'),
    term4: document.getElementById('term4'),
    term5: document.getElementById('term5')
  };

  let state;

  boot();

  async function boot() {
    session = await loadSession();
    if (!session) return;
    activeUser = resolveActiveUser();
    renderAccountControls();
    products = await loadProducts();
    const quoteState = await loadQuoteState();
    state = {
      quote: normalizeQuote(quoteState.quote || []).map(formatQuoteTextIfNeeded),
      quoteCode: quoteState.quoteCode || generateQuoteCode(),
      customer: quoteState.customer || {},
      terms: quoteState.terms || {},
      offer: quoteState.offer || '',
      filteredProducts: []
    };
    init();
  }

  function init() {
    const userLabel = session.role === 'admin' ? `当前操作：${activeUser}` : `当前账号：${session.username}`;
    els.catalogStats.textContent = `${userLabel}，${products.length} 个产品`;
    els.quoteCode.value = state.quoteCode;
    saveQuoteStateDebounced();
    hydrateCustomer();
    hydrateTerms();
    displayOfferInput();
    renderQuoteTable();
    bindEvents();
  }

  async function loadSession() {
    try {
      const response = await fetch('/api/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('unauthorized');
      return await response.json();
    } catch (error) {
      window.location.href = 'login.html';
      return null;
    }
  }

  function resolveActiveUser() {
    if (session.role !== 'admin') return session.username;
    const users = session.users || [];
    const saved = localStorage.getItem('ecowaterActiveUser') || session.username;
    return users.some((user) => user.username === saved) ? saved : session.username;
  }

  function renderAccountControls() {
    els.accountInfo.textContent = `${session.displayName || session.username}（${session.role === 'admin' ? '管理员' : '普通用户'}）`;
    if (session.role === 'admin') {
      els.activeUserLabel.hidden = false;
      els.quoteRecordsLink.hidden = false;
      els.activeUserSelect.innerHTML = (session.users || []).map((user) => {
        const label = `${user.displayName || user.username} / ${user.username}`;
        return `<option value="${escapeAttr(user.username)}">${escapeHtml(label)}</option>`;
      }).join('');
      els.activeUserSelect.value = activeUser;
    } else {
      els.activeUserLabel.hidden = true;
      els.quoteRecordsLink.hidden = true;
    }
  }

  async function loadQuoteState() {
    const response = await fetch(apiUrl('/api/quote-state'), { cache: 'no-store' });
    if (!response.ok) return defaultQuoteState();
    const data = await response.json();
    if (!data.quote?.length && activeUser === session.username) {
      const legacy = legacyQuoteState();
      if (legacy.quote.length || Object.keys(legacy.customer).length || Object.keys(legacy.terms).length) {
        await saveQuoteStateNow(legacy);
        return legacy;
      }
    }
    return { ...defaultQuoteState(), ...data };
  }

  function defaultQuoteState() {
    return { quote: [], customer: {}, terms: {}, offer: '', quoteCode: '' };
  }

  function legacyQuoteState() {
    return {
      quote: readJson(legacyStorageKeys.quote, []),
      customer: readJson(legacyStorageKeys.customer, {}),
      terms: readJson(legacyStorageKeys.terms, {}),
      offer: localStorage.getItem(legacyStorageKeys.offer) || '',
      quoteCode: localStorage.getItem(legacyStorageKeys.quoteCode) || ''
    };
  }

  function apiUrl(path) {
    const query = session.role === 'admin' ? `?user=${encodeURIComponent(activeUser)}` : '';
    return `${path}${query}`;
  }

  async function loadProducts() {
    try {
      const response = await fetch(apiUrl('/api/custom-products'), { cache: 'no-store' });
      if (!response.ok) throw new Error('custom products unavailable');
      const custom = await response.json();
      customSettings = {
        categoryOrder: normalizeOrder(custom.categoryOrder),
        productOrder: normalizeOrder(custom.productOrder),
        deletedProductIds: normalizeOrder(custom.deletedProductIds)
      };
      return sortProducts(mergeProducts(baseProducts, custom));
    } catch (error) {
      customSettings = { categoryOrder: [], productOrder: [], deletedProductIds: [] };
      return sortProducts(baseProducts);
    }
  }

  function mergeProducts(base, custom) {
    const overrides = custom && typeof custom.overrides === 'object' ? custom.overrides : {};
    const additions = Array.isArray(custom?.additions) ? custom.additions : [];
    const deleted = new Set(normalizeOrder(custom?.deletedProductIds));
    const used = new Set();
    const merged = base.filter((product) => !deleted.has(product.id)).map((product) => {
      used.add(product.id);
      return overrides[product.id] ? normalizeProduct({ ...product, ...overrides[product.id] }) : product;
    });
    additions.forEach((product) => {
      const clean = normalizeProduct(product);
      if (clean.id && !used.has(clean.id)) {
        used.add(clean.id);
        merged.push(clean);
      }
    });
    return merged;
  }

  function normalizeProduct(product) {
    return {
      id: product.id || `custom-${Date.now()}`,
      category: product.category || '自定义产品',
      series: product.series || product.category || '自定义产品',
      name: product.name || product.model || '未命名产品',
      model: product.model || '',
      price: product.price === '' || product.price === null || product.price === undefined ? null : toNumber(product.price),
      priceLabel: product.priceLabel || '',
      productImage: product.productImage || '',
      installImage: product.installImage || '',
      featureImage: product.featureImage || '',
      details: product.details || '',
      installText: product.installText || '',
      features: product.features || '',
      sourceSheet: product.sourceSheet || '',
      sourceRow: product.sourceRow || 0
    };
  }

  function bindEvents() {
    els.loadTemplateButton.addEventListener('click', loadTemplateQuote);
    els.clearQuoteButton.addEventListener('click', clearQuote);
    els.exportPdfButton.addEventListener('click', exportPdf);
    els.printQuoteButton.addEventListener('click', () => window.print());
    els.changePasswordButton.addEventListener('click', changePassword);
    els.logoutButton.addEventListener('click', logout);
    els.activeUserSelect.addEventListener('change', () => {
      localStorage.setItem('ecowaterActiveUser', els.activeUserSelect.value);
      window.location.reload();
    });

    els.quoteTableBody.addEventListener('input', (event) => {
      if (event.target.id === 'productSearch') {
        renderProductOptions(false);
        return;
      }
      if (event.target.id === 'quantityInput') {
        renderAddProductPreview();
        return;
      }
      const field = event.target.dataset.field;
      const quoteId = event.target.dataset.quoteId;
      if (!field || !quoteId) return;
      updateQuoteItem(quoteId, field, event.target.value, event.target.closest('tr'));
    });

    els.quoteTableBody.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.target.id === 'productSearch') {
        event.preventDefault();
        addSelectedProduct();
        return;
      }
      if (event.target.dataset.rowProductId) {
        event.preventDefault();
        chooseRowProduct(event.target.dataset.rowProductId, event.target.value, true);
      }
    });

    els.quoteTableBody.addEventListener('click', (event) => {
      if (event.target.closest('#addProductButton')) {
        addSelectedProduct();
        return;
      }

      const removeButton = event.target.closest('[data-remove-id]');
      if (removeButton) {
        state.quote = state.quote.filter((item) => item.quoteId !== removeButton.dataset.removeId);
        persistQuote();
        renderQuoteTable();
        return;
      }

      const imageButton = event.target.closest('[data-large-image]');
      if (imageButton && imageButton.dataset.largeImage) {
        els.largeImage.src = imageButton.dataset.largeImage;
        els.largeImage.alt = imageButton.dataset.imageAlt || '';
        els.imageDialog.showModal();
      }
    });

    els.quoteTableBody.addEventListener('change', (event) => {
      if (event.target.id === 'categorySelect') {
        const picker = pickerEls();
        if (picker.productSearch) {
          picker.productSearch.value = '';
          picker.productSearch.dataset.selectedProductId = '';
        }
        renderProductOptions(false);
        return;
      }
      if (event.target.id === 'productSearch') {
        renderProductOptions(false);
        return;
      }
      if (event.target.dataset.rowCategoryId) {
        chooseRowCategory(event.target.dataset.rowCategoryId, event.target.value);
        return;
      }
      if (event.target.dataset.rowProductId) {
        chooseRowProduct(event.target.dataset.rowProductId, event.target.value, false);
        return;
      }
      if (event.target.dataset.field === 'price') {
        maybeSyncProductPrice(event.target.dataset.quoteId);
      }
    });

    els.quoteTableBody.addEventListener('focusin', (event) => {
      if (event.target.id === 'productSearch' || event.target.dataset.rowProductId) event.target.select();
    });

    els.closeImageDialog.addEventListener('click', () => els.imageDialog.close());
    els.imageDialog.addEventListener('click', (event) => {
      if (event.target === els.imageDialog) els.imageDialog.close();
    });

    customerInputs().forEach((input) => {
      input.addEventListener('input', () => {
        state.customer[input.id] = input.value.trim();
        saveQuoteStateDebounced();
      });
    });

    termInputs().forEach((input) => {
      input.addEventListener('input', () => {
        state.terms[input.id] = input.value;
        saveQuoteStateDebounced();
      });
    });

    els.offerInput.addEventListener('input', () => {
      const raw = parseOfferValue(els.offerInput.value);
      els.offerInput.value = raw;
      state.offer = raw;
      saveQuoteStateDebounced();
      renderTotals();
    });
    els.offerInput.addEventListener('focus', () => {
      els.offerInput.value = state.offer;
    });
    els.offerInput.addEventListener('blur', displayOfferInput);
  }

  function renderCategoryOptions() {
    const picker = pickerEls();
    if (!picker.categorySelect) return;
    const previous = picker.categorySelect.value;
    const options = ['<option value="">全部品类</option>'];
    productCategories().forEach((category) => {
      const count = products.filter((product) => product.category === category).length;
      options.push(`<option value="${escapeAttr(category)}">${escapeHtml(category)}（${count}）</option>`);
    });
    picker.categorySelect.innerHTML = options.join('');
    picker.categorySelect.value = previous;
  }

  function productCategories() {
    const categoryIndex = orderIndex(customSettings.categoryOrder);
    return [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => {
      return compareOrder(categoryIndex, a, b) || a.localeCompare(b, 'zh-CN', { numeric: true });
    });
  }

  function sortProducts(items) {
    return [...items].sort(compareProducts);
  }

  function compareProducts(a, b) {
    const categoryIndex = orderIndex(customSettings.categoryOrder);
    const productIndex = orderIndex(customSettings.productOrder);
    const categoryOrder = compareOrder(categoryIndex, a.category, b.category);
    if (categoryOrder !== 0) return categoryOrder;
    const categoryText = a.category.localeCompare(b.category, 'zh-CN', { numeric: true });
    if (categoryText !== 0) return categoryText;

    const productOrder = compareOrder(productIndex, a.id, b.id);
    if (productOrder !== 0) return productOrder;
    return `${a.series}${a.name}${a.model}`.localeCompare(`${b.series}${b.name}${b.model}`, 'zh-CN', { numeric: true });
  }

  function normalizeOrder(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
  }

  function orderIndex(order) {
    return new Map(normalizeOrder(order).map((value, index) => [value, index]));
  }

  function compareOrder(index, a, b) {
    const aIndex = index.has(a) ? index.get(a) : Number.MAX_SAFE_INTEGER;
    const bIndex = index.has(b) ? index.get(b) : Number.MAX_SAFE_INTEGER;
    return aIndex === bIndex ? 0 : aIndex - bIndex;
  }

  function renderProductOptions(selectFirst = false) {
    const picker = pickerEls();
    if (!picker.categorySelect || !picker.productSearch || !picker.productOptions) return;
    renderCategoryOptions();
    let category = picker.categorySelect.value;
    const query = picker.productSearch.value.trim().toLowerCase();
    const selected = productFromSearchValue();
    if (selected && selected.category && category !== selected.category) {
      picker.categorySelect.value = selected.category;
      category = selected.category;
    }

    state.filteredProducts = products.filter((product) => {
      const categoryMatch = !category || product.category === category;
      const text = [
        product.category,
        product.series,
        product.name,
        product.model,
        productOptionLabel(product),
        product.details,
        product.features
      ].join(' ').toLowerCase();
      return categoryMatch && (!query || text.includes(query));
    }).sort(compareProducts);

    picker.productOptions.innerHTML = state.filteredProducts.map((product) => {
      return `<option value="${escapeAttr(productOptionLabel(product))}"></option>`;
    }).join('');

    if (selectFirst && !picker.productSearch.value && state.filteredProducts[0]) {
      picker.productSearch.value = productOptionLabel(state.filteredProducts[0]);
      if (state.filteredProducts[0].category) picker.categorySelect.value = state.filteredProducts[0].category;
    }

    const exact = productFromSearchValue();
    picker.productSearch.dataset.selectedProductId = exact ? exact.id : '';
    renderAddProductPreview();
  }

  function selectedProduct(useFirst = false) {
    const exact = productFromSearchValue();
    if (exact) return exact;
    const picker = pickerEls();
    const hasSearchText = Boolean(picker.productSearch?.value.trim());
    return useFirst && hasSearchText ? state.filteredProducts[0] : null;
  }

  function productFromSearchValue() {
    const picker = pickerEls();
    const value = picker.productSearch?.value.trim() || '';
    if (!value) return null;
    return products.find((product) => productOptionLabel(product) === value) || null;
  }

  function productOptionLabel(product) {
    const price = product.price === null ? '询价' : money(product.price);
    return `${product.model || '未标型号'} | ${product.name || ''} | ${product.category || ''} | ${price}`;
  }

  function addSelectedProduct() {
    const product = selectedProduct(true);
    if (!product) {
      showToast('请选择产品');
      return;
    }
    const picker = pickerEls();
    const qty = Math.max(1, toNumber(picker.quantityInput?.value) || 1);
    state.quote.push(productToQuoteItem(product, qty));
    if (picker.productSearch) {
      picker.productSearch.value = '';
      picker.productSearch.dataset.selectedProductId = '';
    }
    if (picker.categorySelect) picker.categorySelect.value = '';
    if (picker.quantityInput) picker.quantityInput.value = '1';
    persistQuote();
    renderQuoteTable();
    showToast('已添加到报价单');
  }

  function chooseRowCategory(quoteId, category) {
    const product = products.filter((entry) => entry.category === category).sort(compareProducts)[0];
    if (product) {
      replaceQuoteItemProduct(quoteId, product);
      return;
    }
    const item = state.quote.find((entry) => entry.quoteId === quoteId);
    if (!item) return;
    item.category = category;
    item.productId = '';
    item.name = '';
    item.model = '';
    item.productImage = '';
    item.price = 0;
    item.details = '';
    item.features = '';
    persistQuote();
    renderQuoteTable();
  }

  function chooseRowProduct(quoteId, value, useFirst = false) {
    const item = state.quote.find((entry) => entry.quoteId === quoteId);
    if (!item) return;
    const query = String(value || '').trim().toLowerCase();
    const matches = products.filter((product) => {
      const text = [productOptionLabel(product), product.category, product.name, product.model, product.series].join(' ').toLowerCase();
      return !query || text.includes(query);
    }).sort(compareProducts);
    const exact = products.find((product) => productOptionLabel(product) === value);
    const product = exact || (useFirst ? matches[0] : null);
    if (!product) return;
    replaceQuoteItemProduct(quoteId, product);
  }

  function replaceQuoteItemProduct(quoteId, product) {
    const index = state.quote.findIndex((entry) => entry.quoteId === quoteId);
    if (index < 0) return;
    const current = state.quote[index];
    state.quote[index] = {
      ...productToQuoteItem(product, Math.max(1, toNumber(current.qty) || 1)),
      quoteId: current.quoteId,
      location: current.location || '',
      filterLife: current.filterLife || ''
    };
    persistQuote();
    renderQuoteTable();
  }

  function pickerEls() {
    return {
      categorySelect: document.getElementById('categorySelect'),
      productSearch: document.getElementById('productSearch'),
      productOptions: document.getElementById('productOptions'),
      quantityInput: document.getElementById('quantityInput'),
      addProductButton: document.getElementById('addProductButton'),
      addProductImage: document.getElementById('addProductImage'),
      addProductUnit: document.getElementById('addProductUnit'),
      addProductPrice: document.getElementById('addProductPrice'),
      addProductTotal: document.getElementById('addProductTotal'),
      addProductSummary: document.getElementById('addProductSummary')
    };
  }

  function productToQuoteItem(product, qty) {
    return {
      quoteId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      productId: product.id,
      category: product.category,
      series: product.series,
      name: product.name,
      model: product.model,
      productImage: product.productImage,
      unit: '台',
      price: product.price || 0,
      qty,
      location: '',
      filterLife: '',
      details: summarizeDetails(product.details || ''),
      features: summarizeFeatures(product.features || ''),
      textFormatVersion
    };
  }

  function renderQuoteTable() {
    if (!state.quote.length) {
      els.quoteTableBody.innerHTML = '<tr class="empty-row"><td colspan="12">暂无产品，请在下方选择产品后添加</td></tr>' + addProductRowHtml();
      renderProductOptions(false);
      renderTotals();
      return;
    }

    els.quoteTableBody.innerHTML = state.quote.map((item, index) => quoteRow(item, index)).join('') + addProductRowHtml();
    renderProductOptions(false);
    autoSizeTextareas();
    renderTotals();
  }

  function addProductRowHtml() {
    return `
      <tr class="add-product-row no-print">
        <td class="add-row-label">添加</td>
        <td><select id="categorySelect" aria-label="选择类别"></select></td>
        <td class="model-picker-cell">
          <input id="productSearch" type="search" list="productOptions" placeholder="搜索型号/名称" autocomplete="off">
          <datalist id="productOptions"></datalist>
        </td>
        <td class="add-image-cell" id="addProductImage">暂无图片</td>
        <td id="addProductUnit"></td>
        <td class="money-display" id="addProductPrice">¥0</td>
        <td><input id="quantityInput" type="number" min="1" step="1" value="1"></td>
        <td class="money-display" id="addProductTotal">¥0</td>
        <td colspan="3" class="add-product-summary" id="addProductSummary">请选择产品</td>
        <td><button class="primary-button" id="addProductButton" type="button">添加产品</button></td>
      </tr>
    `;
  }

  function renderAddProductPreview() {
    const picker = pickerEls();
    if (!picker.addProductImage) return;
    const product = selectedProduct();
    const qty = Math.max(1, toNumber(picker.quantityInput?.value) || 1);
    if (!product) {
      picker.addProductImage.textContent = '暂无图片';
      picker.addProductUnit.textContent = '';
      picker.addProductPrice.textContent = money(0);
      picker.addProductTotal.textContent = money(0);
      picker.addProductSummary.textContent = '请选择产品';
      return;
    }
    picker.addProductImage.innerHTML = product.productImage
      ? `<img src="${escapeAttr(product.productImage)}" alt="${escapeAttr(product.name)}">`
      : '暂无图片';
    picker.addProductUnit.textContent = ' / 台';
    picker.addProductPrice.textContent = money(product.price || 0);
    picker.addProductTotal.textContent = money((product.price || 0) * qty);
    picker.addProductSummary.textContent = [product.model, product.name, product.series].filter(Boolean).join(' / ');
  }

  function rowCategoryCell(item) {
    const categories = [...productCategories()];
    if (item.category && !categories.includes(item.category)) categories.unshift(item.category);
    const options = categories.map((category) => {
      const selected = category === item.category ? ' selected' : '';
      return `<option value="${escapeAttr(category)}"${selected}>${escapeHtml(category)}</option>`;
    }).join('');
    return `
      <select class="cell-input row-category-picker no-print" data-row-category-id="${escapeAttr(item.quoteId)}">${options}</select>
      <div class="print-cell-text">${escapeHtml(item.category || '')}</div>
    `;
  }

  function rowProductCell(item, index) {
    const datalistId = `rowProductOptions${index}`;
    const options = products
      .sort(compareProducts)
      .map((product) => `<option value="${escapeAttr(productOptionLabel(product))}"></option>`)
      .join('');
    return `
      <input class="cell-input row-product-search no-print" data-row-product-id="${escapeAttr(item.quoteId)}" list="${escapeAttr(datalistId)}" value="${escapeAttr(quoteItemProductLabel(item))}" autocomplete="off">
      <datalist id="${escapeAttr(datalistId)}">${options}</datalist>
      <div class="print-cell-text">${escapeHtml(item.model || '')}</div>
    `;
  }

  function quoteItemProductLabel(item) {
    const product = products.find((entry) => entry.id === item.productId);
    if (product) return productOptionLabel(product);
    const price = item.price === null ? '询价' : money(item.price || 0);
    return `${item.model || '未标型号'} | ${item.name || ''} | ${item.category || ''} | ${price}`;
  }

  function quoteRow(item, index) {
    const subtotal = toNumber(item.price) * toNumber(item.qty);
    const image = item.productImage
      ? `<button type="button" data-large-image="${escapeAttr(item.productImage)}" data-image-alt="${escapeAttr(item.name)}">
          <img src="${escapeAttr(item.productImage)}" alt="${escapeAttr(item.name)}" loading="eager">
        </button>`
      : '<div class="empty-image">暂无图片</div>';

    return `
      <tr data-row-id="${escapeAttr(item.quoteId)}">
        <td class="index-cell">
          ${index + 1}
          <button class="remove-row no-print" type="button" data-remove-id="${escapeAttr(item.quoteId)}" title="删除">×</button>
        </td>
        <td>${rowCategoryCell(item)}</td>
        <td>${rowProductCell(item, index)}</td>
        <td class="image-cell">${image}</td>
        <td><input class="cell-input" data-quote-id="${escapeAttr(item.quoteId)}" data-field="unit" value="${escapeAttr(item.unit || '台')}"></td>
        <td><input class="cell-input number-input" type="number" min="0" step="1" data-quote-id="${escapeAttr(item.quoteId)}" data-field="price" value="${escapeAttr(item.price)}"></td>
        <td><input class="cell-input number-input" type="number" min="0" step="1" data-quote-id="${escapeAttr(item.quoteId)}" data-field="qty" value="${escapeAttr(item.qty)}"></td>
        <td class="money-display row-total">${money(subtotal)}</td>
        <td>${editableTextCell(item, 'location')}</td>
        <td>${editableTextCell(item, 'filterLife')}</td>
        <td>${editableTextCell(item, 'details')}</td>
        <td>${editableTextCell(item, 'features')}</td>
      </tr>
    `;
  }

  function editableTextCell(item, field) {
    const value = item[field] || '';
    return `
      <textarea class="cell-textarea" data-quote-id="${escapeAttr(item.quoteId)}" data-field="${escapeAttr(field)}">${escapeHtml(value)}</textarea>
      <div class="print-cell-text" data-print-field="${escapeAttr(field)}">${escapeHtml(value)}</div>
    `;
  }

  function updateQuoteItem(quoteId, field, value, row) {
    const item = state.quote.find((entry) => entry.quoteId === quoteId);
    if (!item) return;

    if (field === 'price' || field === 'qty') {
      item[field] = toNumber(value);
      if (row) {
        const total = row.querySelector('.row-total');
        if (total) total.textContent = money(toNumber(item.price) * toNumber(item.qty));
      }
      renderTotals();
    } else {
      item[field] = value;
      if (row) {
        const printText = row.querySelector(`[data-print-field="${field}"]`);
        if (printText) printText.textContent = value;
      }
    }

    if (field !== 'price' && field !== 'qty' && row) autoSizeTextareas(row);
    persistQuote();
  }

  async function maybeSyncProductPrice(quoteId) {
    const item = state.quote.find((entry) => entry.quoteId === quoteId);
    if (!item || !item.productId) return;
    const price = toNumber(item.price);
    const product = products.find((entry) => entry.id === item.productId);
    if (product && toNumber(product.price) === price) return;

    const label = [item.category, item.name, item.model].filter(Boolean).join(' / ') || '该产品';
    if (!window.confirm(`是否同步更新产品管理里的单价？\n${label}\n新单价：${money(price)}`)) return;

    try {
      const response = await fetch(apiUrl('/api/product-price'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: item.productId, price })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '更新产品价格失败');
      if (product) product.price = price;
      renderProductOptions();
      showToast('产品管理价格已更新');
    } catch (error) {
      showToast(error.message || '更新产品价格失败');
    }
  }

  function loadTemplateQuote() {
    const template = (catalog.templateQuote || []).filter((item) => item.name || item.model);
    if (!template.length) {
      showToast('第1页示例为空');
      return;
    }

    state.quote = template.map((item) => {
      const product = products.find((entry) => entry.model === item.model && entry.name === item.name)
        || products.find((entry) => entry.model === item.model)
        || {};
      return {
        quoteId: `template-${item.model || item.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        productId: product.id || '',
        category: product.category || item.name || '',
        series: product.series || '',
        name: item.name || product.name || '',
        model: item.model || product.model || '',
        productImage: item.productImage || product.productImage || '',
        unit: item.unit || '台',
        price: item.price || product.price || 0,
        qty: item.qty || 1,
        location: item.location || '',
        filterLife: item.filterLife || '',
        details: summarizeDetails(item.details || product.details || ''),
        features: summarizeFeatures(item.features || product.features || ''),
        textFormatVersion
      };
    });

    state.offer = '';
    state.quoteCode = generateQuoteCode();
    els.quoteCode.value = state.quoteCode;
    els.offerInput.value = '';
    persistQuote();
    renderQuoteTable();
    showToast('已载入第1页示例');
  }

  function clearQuote() {
    const seller = {
      sellerName: state.customer.sellerName || '',
      sellerPhone: state.customer.sellerPhone || ''
    };
    state.quote = [];
    state.customer = seller;
    state.offer = '';
    state.quoteCode = generateQuoteCode();
    els.quoteCode.value = state.quoteCode;
    els.offerInput.value = '';
    hydrateCustomer();
    persistQuote();
    renderQuoteTable();
  }

  async function changePassword() {
    const oldPassword = window.prompt('请输入原密码');
    if (oldPassword === null) return;
    const newPassword = window.prompt('请输入新密码（至少 4 位）');
    if (newPassword === null) return;
    const confirmPassword = window.prompt('请再次输入新密码');
    if (confirmPassword === null) return;
    if (newPassword !== confirmPassword) {
      showToast('两次新密码不一致');
      return;
    }
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '修改密码失败');
      showToast('密码已修改');
    } catch (error) {
      showToast(error.message || '修改密码失败');
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'login.html';
  }

  async function exportPdf() {
    const sheet = document.getElementById('quoteSheet');
    if (!sheet) return;

    els.exportPdfButton.disabled = true;
    const oldText = els.exportPdfButton.textContent;
    els.exportPdfButton.textContent = '正在导出...';

    try {
      const css = await fetch('styles.css', { cache: 'no-store' }).then((response) => response.text());
      const width = Math.ceil(sheet.getBoundingClientRect().width);
      const height = Math.ceil(sheet.scrollHeight);
      const html = buildExportHtml(sheet, css, width, height);
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlBase64: encodeBase64Utf8(html),
          width,
          height,
          filename: buildPdfFilename(),
          returnUrl: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(cleanExportError(errorText, response.status));
      }

      const result = await response.json();
      const url = result.url;
      if (!url) throw new Error('PDF 地址为空');
      window.location.href = url;
      showToast('PDF 已打开');
    } catch (error) {
      console.error(error);
      const message = error.message || '请查看服务器日志';
      showToast(`PDF 导出失败：${message.slice(0, 80)}`);
    } finally {
      els.exportPdfButton.disabled = false;
      els.exportPdfButton.textContent = oldText;
    }
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  function cleanExportError(errorText, status) {
    const raw = String(errorText || '').trim();
    if (!raw) return `服务器返回 ${status}`;
    if (/^\s*<!doctype html/i.test(raw) || /^\s*<html/i.test(raw)) {
      if (status === 413 || /too large|request entity|payload/i.test(raw)) {
        return '请求被反向代理拦截，需调大 client_max_body_size';
      }
      if (/login|登录/i.test(raw)) return '登录状态失效，请重新登录';
      return `服务器返回 HTML 错误页（HTTP ${status}），请查看反向代理日志`;
    }
    return raw.replace(/\s+/g, ' ').slice(0, 240);
  }

  function buildExportHtml(sheet, css, width, height) {
    const clone = sheet.cloneNode(true);
    prepareExportClone(clone);
    const baseHref = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
    const exportCss = `
      @page { size: ${width}px ${height}px; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; width: ${width}px !important; min-width: 0 !important; background: #ffffff !important; }
        .quote-sheet { box-shadow: none !important; margin: 0 !important; min-height: ${height}px !important; padding: 18px 18px 0 !important; width: ${width}px !important; zoom: 1 !important; }
        .no-print, .toolbar, .image-dialog, .remove-row, .dialog-close, .print-cell-text { display: none !important; }
        .sheet-brand-row { min-height: 190px !important; }
        .logo-box { height: 184px !important; }
        .logo-box img { max-height: 180px !important; }
        .sheet-title { font-size: 34px !important; margin: 4px 0 12px !important; }
        .sheet-tail-image { align-items: flex-start !important; aspect-ratio: 1079 / 278 !important; margin: 14px -18px 0 !important; min-height: 0 !important; overflow: hidden !important; }
        .sheet-tail-image img { flex: 0 0 auto !important; height: auto !important; max-height: none !important; width: 100% !important; }
        .sheet-bottom { margin-top: 12px !important; }
        .terms-grid { margin-top: 0 !important; }
        .export-value { display: block !important; white-space: pre-line !important; word-break: break-word !important; }
        .quote-table th, .quote-table td { font-size: 12px !important; line-height: 1.35 !important; padding: 5px !important; }
        .image-cell { height: 104px !important; }
        .image-cell img { height: 94px !important; object-fit: contain !important; }
      }
      html, body { margin: 0; padding: 0; width: ${width}px; background: #ffffff; }
      .quote-sheet { box-shadow: none !important; margin: 0 !important; min-height: ${height}px; }
      .no-print, .toolbar, .image-dialog, .remove-row, .dialog-close, .print-cell-text { display: none !important; }
      .sheet-brand-row { min-height: 190px !important; }
      .logo-box { height: 184px !important; }
      .logo-box img { max-height: 180px !important; }
      .sheet-title { font-size: 34px !important; margin: 4px 0 12px !important; }
      .sheet-tail-image { align-items: flex-start !important; aspect-ratio: 1079 / 278 !important; margin: 14px -18px 0 !important; min-height: 0 !important; overflow: hidden !important; }
      .sheet-tail-image img { flex: 0 0 auto !important; height: auto !important; max-height: none !important; width: 100% !important; }
      .sheet-bottom { margin-top: 12px !important; }
      .terms-grid { margin-top: 0 !important; }
      .export-value { white-space: pre-line; word-break: break-word; }
    `;

    return `<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <base href="${escapeAttr(baseHref)}">
          <title>报价单PDF</title>
          <style>${css}</style>
          <style>${exportCss}</style>
        </head>
        <body>${clone.outerHTML}</body>
      </html>`;
  }

  function prepareExportClone(clone) {
    preserveSelectableCellText(clone);
    clone.querySelectorAll('.print-cell-text').forEach((node) => node.remove());
    clone.querySelectorAll('.no-print, .remove-row').forEach((node) => node.remove());

    clone.querySelectorAll('textarea').forEach((textarea) => {
      const value = textarea.value || textarea.textContent || '';
      const div = document.createElement('div');
      div.className = 'export-value';
      div.textContent = value;
      textarea.replaceWith(div);
    });

    clone.querySelectorAll('input').forEach((input) => {
      const div = document.createElement('div');
      div.className = input.className ? `export-value ${input.className}` : 'export-value';
      div.textContent = input.value || '';
      input.replaceWith(div);
    });

    clone.querySelectorAll('select').forEach((select) => {
      const div = document.createElement('div');
      div.className = 'export-value';
      div.textContent = select.selectedOptions[0]?.textContent || '';
      select.replaceWith(div);
    });

    clone.querySelectorAll('.image-cell button').forEach((button) => {
      const img = button.querySelector('img');
      if (img) button.replaceWith(img.cloneNode(true));
    });
  }

  function preserveSelectableCellText(clone) {
    clone.querySelectorAll('.row-category-picker, .row-product-search').forEach((control) => {
      const cell = control.closest('td');
      if (!cell) return;
      const printText = cell.querySelector('.print-cell-text')?.textContent || '';
      const fallback = control.tagName === 'SELECT'
        ? control.selectedOptions[0]?.textContent || control.value || ''
        : productModelFromLabel(control.value || '');
      const div = document.createElement('div');
      div.className = 'export-value';
      div.textContent = printText.trim() || fallback;
      cell.textContent = '';
      cell.appendChild(div);
    });
  }

  function productModelFromLabel(value) {
    return String(value || '').split('|')[0].trim();
  }

  function buildPdfFilename() {
    const company = (els.customerCompany.value || '报价单').trim().replace(/[\\/:*?"<>|]/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const code = (els.quoteCode.value || state.quoteCode || '').trim();
    return `${code || date}-${company || '报价单'}.pdf`;
  }

  function renderTotals() {
    const subtotal = state.quote.reduce((sum, item) => sum + toNumber(item.price) * toNumber(item.qty), 0);
    const finalTotal = state.offer === '' ? subtotal : toNumber(state.offer);
    els.subtotalCell.textContent = money(subtotal);
  }

  function displayOfferInput() {
    els.offerInput.value = state.offer === '' ? '' : money(state.offer);
  }

  function parseOfferValue(value) {
    const cleaned = String(value || '').replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;
    return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  }

  function hydrateCustomer() {
    customerInputs().forEach((input) => {
      input.value = state.customer[input.id] || '';
    });
  }

  function hydrateTerms() {
    termInputs().forEach((input) => {
      if (Object.prototype.hasOwnProperty.call(state.terms, input.id)) {
        input.value = state.terms[input.id];
      }
    });
  }

  function customerInputs() {
    return [
      els.customerCompany,
      els.customerAddress,
      els.customerName,
      els.customerPhone,
      els.sellerName,
      els.sellerPhone
    ];
  }

  function termInputs() {
    return [
      els.term1,
      els.term2,
      els.term3,
      els.term4,
      els.term5
    ];
  }

  function normalizeQuote(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      quoteId: item.quoteId || `${item.productId || item.model || 'row'}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      productId: item.productId || '',
      category: item.category || '',
      series: item.series || '',
      name: item.name || '',
      model: item.model || '',
      productImage: item.productImage || '',
      unit: item.unit || '台',
      price: toNumber(item.price),
      qty: toNumber(item.qty) || 1,
      location: item.location || '',
      filterLife: item.filterLife || '',
      details: item.details || '',
      features: item.features || '',
      textFormatVersion: item.textFormatVersion || 0
    }));
  }

  function formatQuoteTextIfNeeded(item) {
    if (item.textFormatVersion === textFormatVersion) return item;
    const product = products.find((entry) => entry.id === item.productId)
      || products.find((entry) => entry.model && entry.model === item.model)
      || {};
    return {
      ...item,
      details: summarizeDetails(product.details || item.details || ''),
      features: summarizeFeatures(product.features || item.features || ''),
      textFormatVersion
    };
  }

  function summarizeDetails(text) {
    const lines = selectImportantLines(text, [
      '净水流量',
      '日常使用流量',
      '初始流量',
      '额定总净水量',
      '工作水压',
      '进水水压',
      '工作压力',
      '工作水温',
      '适用水温',
      '使用水温',
      '过滤精度',
      '水效等级',
      '产品尺寸',
      '外形尺寸',
      '进出水口径',
      '进出水管径',
      '额定功率',
      '额定电压',
      '树脂',
      '活性炭',
      '盐箱'
    ], 7, 34);
    return lines.join('\n');
  }

  function summarizeFeatures(text) {
    const lines = selectImportantLines(text, [
      '去除',
      '过滤',
      '净化',
      '自动',
      '智能',
      '互联',
      '漏水',
      '安全',
      '静音',
      '即热',
      '调温',
      '童锁',
      '防护',
      '防止',
      'RO',
      '反渗透',
      '活性炭',
      '树脂',
      'NSF',
      '旁通阀',
      '再生',
      'UV',
      '大流量',
      '一键'
    ], 10, 24)
      .filter((line) => !isFeatureFiller(line))
      .slice(0, 6);
    return lines.map((line) => line.startsWith('•') ? line : `• ${line}`).join('\n');
  }

  function selectImportantLines(text, keywords, maxLines, maxLength) {
    const candidates = tokenizeText(text);
    const picked = [];
    const seen = new Set();

    keywords.forEach((keyword) => {
      const match = candidates.find((line) => line.includes(keyword) && !seen.has(lineKey(line)));
      if (match) {
        seen.add(lineKey(match));
        picked.push(shortenLine(match, maxLength));
      }
    });

    candidates.forEach((line) => {
      if (picked.length >= maxLines) return;
      const key = lineKey(line);
      if (seen.has(key)) return;
      seen.add(key);
      picked.push(shortenLine(line, maxLength));
    });

    return picked.slice(0, maxLines);
  }

  function tokenizeText(text) {
    return String(text || '')
      .replace(/\u200b/g, '')
      .replace(/[ \t]+/g, ' ')
      .split(/\n|｜|。|；|;|•/)
      .map((line) => cleanLine(line))
      .filter((line) => line.length >= 3)
      .filter((line) => !/^\-+$/.test(line));
  }

  function cleanLine(line) {
    return String(line || '')
      .replace(/^[\s·、，,。；;：:]+/, '')
      .replace(/\s*[:：]\s*/g, '：')
      .replace(/\s*[xX*×]\s*/g, '×')
      .replace(/，?防止因热水倒灌造成的滤瓶或其他部件损坏/g, '，防热水倒灌')
      .replace(/，?有效保护因水压过高造成的机器损坏/g, '，防高压损坏')
      .replace(/，?拦截水中大颗粒杂质/g, '，拦截大颗粒')
      .replace(/高品质PC材质滤瓶，符合GB4806（食品接触材料国家标准）/g, '食品级PC滤瓶')
      .replace(/手机与设备实时互联，产品状态实时掌握/g, '手机互联，状态实时掌握')
      .replace(/\s+/g, ' ')
      .replace(/，?让使用更加方便$/, '')
      .replace(/，?安全放心$/, '')
      .trim();
  }

  function isFeatureFiller(line) {
    return [
      '把好净水第一关',
      '品质好水',
      '放心饮',
      '尽享舒适神仙水',
      '全新外观设计'
    ].some((text) => line.includes(text));
  }

  function shortenLine(line, maxLength) {
    const value = cleanLine(line);
    if (value.length <= maxLength) return value;
    const cutAt = Math.max(
      value.lastIndexOf('，', maxLength),
      value.lastIndexOf('、', maxLength),
      value.lastIndexOf(' ', maxLength)
    );
    if (cutAt > 12) return `${value.slice(0, cutAt)}…`;
    return `${value.slice(0, maxLength)}…`;
  }

  function lineKey(line) {
    return cleanLine(line).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').slice(0, 22);
  }

  function persistQuote() {
    saveQuoteStateDebounced();
  }

  function quoteStatePayload() {
    return {
      quote: state.quote,
      customer: state.customer,
      terms: state.terms,
      offer: state.offer,
      quoteCode: state.quoteCode
    };
  }

  function saveQuoteStateDebounced() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveQuoteStateNow(quoteStatePayload()).catch((error) => {
        console.error(error);
        showToast('报价保存失败');
      });
    }, 250);
  }

  async function saveQuoteStateNow(payload) {
    const response = await fetch(apiUrl('/api/quote-state'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
  }

  function autoSizeTextareas(scope) {
    const root = scope || document;
    root.querySelectorAll('textarea').forEach((textarea) => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight + 2, 62)}px`;
    });
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function generateQuoteCode() {
    const now = new Date();
    const parts = [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate()),
      pad2(now.getHours()),
      pad2(now.getMinutes()),
      pad2(now.getSeconds())
    ];
    return `BJ${parts.join('')}`;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function showToast(message) {
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1600);
  }

  function money(value) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      maximumFractionDigits: 0
    }).format(toNumber(value));
  }

  function toRmbUppercase(value) {
    const amount = Math.round(toNumber(value) * 100) / 100;
    if (amount <= 0) return '人民币零元整';

    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const units = ['', '拾', '佰', '仟'];
    const sections = ['', '万', '亿', '兆'];
    const integer = Math.floor(amount);
    const cents = Math.round((amount - integer) * 100);
    const jiao = Math.floor(cents / 10);
    const fen = cents % 10;

    let result = integerToUpper(integer, digits, units, sections);
    result = `人民币${result}元`;
    if (jiao === 0 && fen === 0) return `${result}整`;
    if (jiao > 0) result += `${digits[jiao]}角`;
    if (fen > 0) result += `${digits[fen]}分`;
    return result;
  }

  function integerToUpper(number, digits, units, sections) {
    if (number === 0) return '零';
    let result = '';
    let sectionIndex = 0;
    let needZero = false;
    let current = number;

    while (current > 0) {
      const section = current % 10000;
      if (section === 0) {
        needZero = result.length > 0;
      } else {
        let sectionText = sectionToUpper(section, digits, units);
        if (needZero) sectionText = `零${sectionText}`;
        result = `${sectionText}${sections[sectionIndex]}${result}`;
        needZero = section < 1000;
      }
      current = Math.floor(current / 10000);
      sectionIndex += 1;
    }

    return result.replace(/零+/g, '零').replace(/零$/g, '');
  }

  function sectionToUpper(section, digits, units) {
    let result = '';
    let zero = false;
    let unitIndex = 0;
    let current = section;

    while (current > 0) {
      const digit = current % 10;
      if (digit === 0) {
        if (result) zero = true;
      } else {
        if (zero) {
          result = `零${result}`;
          zero = false;
        }
        result = `${digits[digit]}${units[unitIndex]}${result}`;
      }
      unitIndex += 1;
      current = Math.floor(current / 10);
    }

    return result;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
